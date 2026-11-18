import json
import time
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from sm.engine.annotation_lithops.cost_cap import (
    CANCEL_ALLOWANCE,
    LEDGER_INTERVAL,
    LEDGER_WINDOW,
    CostGuard,
    CostLedger,
    build_guard,
    ec2_cost,
    estimate_attempt,
    future_seconds,
    get_max_cost,
    lambda_cost,
    start_cancel_watcher,
)
from sm.engine.errors import CostLimitError, LimitError
from sm.engine.tests.annotation_lithops.fakes import (
    BrokenStorage,
    CountingStorage,
    FakeStorage,
)


def fake_future(running=False, call_status=None, stats=None):
    return SimpleNamespace(running=running, _call_status=call_status, stats=stats or {})


finished_30s = fake_future(
    running=False, call_status={'worker_start_tstamp': 900.0, 'worker_end_tstamp': 930.0}
)
running_60s = fake_future(running=True, call_status={'worker_start_tstamp': 940.0})
not_started = fake_future(running=False, call_status=None)


def test_lambda_cost_matches_aws_price():
    assert lambda_cost(1000, 10) == pytest.approx(16.67e-6 * 1000 + 0.2e-6 * 10)


def test_ec2_cost_uses_32gb_minimum():
    assert ec2_cost(16384, 3600) == pytest.approx(0.2538)


@pytest.mark.parametrize(
    'cfg, expected',
    [
        ({}, 10.0),
        ({'max_cost_usd': None}, None),
        ({'max_cost_usd': 0}, 0.0),
        ({'max_cost_usd': 2.5}, 2.5),
    ],
)
def test_get_max_cost(cfg, expected):
    assert get_max_cost(cfg) == expected


def test_future_seconds_by_state():
    now = 1000.0
    assert future_seconds(not_started, now) == 0
    assert future_seconds(running_60s, now) == 60
    assert future_seconds(finished_30s, now) == 30


def test_future_seconds_clamps_bad_data():
    now = 1000.0
    assert future_seconds(fake_future(running=True, call_status={}), now) == 0
    assert (
        future_seconds(fake_future(running=True, call_status={'worker_start_tstamp': 2000.0}), now)
        == 0
    )
    assert (
        future_seconds(fake_future(running=True, call_status={'worker_start_tstamp': -5000.0}), now)
        == 900
    )
    assert (
        future_seconds(
            fake_future(
                running=False,
                call_status={'worker_start_tstamp': 900.0},
                stats={'worker_exec_time': 12.0},
            ),
            now,
        )
        == 12
    )


def test_estimate_attempt_lambda_sums_futures():
    futures = [finished_30s, running_60s, not_started]
    assert estimate_attempt(futures, 4096, 0.0, 1000.0, False) == pytest.approx(
        lambda_cost(4 * 90, 3)
    )


def test_estimate_attempt_handles_no_futures():
    assert estimate_attempt(None, 4096, 990.0, 1000.0, False) == 0
    assert estimate_attempt([], 4096, 990.0, 1000.0, False) == 0


def test_estimate_attempt_standalone_uses_elapsed():
    assert estimate_attempt([running_60s], 65536, 0.0, 1800.0, True) == pytest.approx(
        ec2_cost(65536, 1800)
    )


def test_cost_limit_error_is_limit_error_with_amounts():
    e = CostLimitError(12.345, 10)
    assert isinstance(e, LimitError)
    assert '$12.35' in str(e) and '$10.00' in str(e) and '$12.35' in e.traceback
    assert (e.spent, e.limit) == (12.345, 10)


def test_save_and_read_others_sums_recent_runs_only():
    st = FakeStorage()
    a = CostLedger(st, 'ds1', 'a', started=1000.0)
    a.new_cancel_key()
    a.save(3.0)
    old = CostLedger(st, 'ds1', 'old', started=1000.0 - LEDGER_WINDOW - 1)
    old.save(9.0)
    other_ds = CostLedger(st, 'ds2', 'x', started=1000.0)
    other_ds.save(5.0)
    b = CostLedger(st, 'ds1', 'b', started=1000.0)
    b.save(1.0)
    cost, keys = b.read_others(now=1000.0)
    assert cost == 3.0 and keys == ['cost_cap/ds1/cancel/a-1']


def test_read_others_skips_corrupt_record():
    st = FakeStorage()
    st.put_object(st.bucket, 'cost_cap/ds1/runs/bad.json', b'{not json')
    a = CostLedger(st, 'ds1', 'a', started=1000.0)
    a.save(2.0)
    assert CostLedger(st, 'ds1', 'b', started=1000.0).read_others(1000.0)[0] == 2.0


def test_storage_errors_fail_open():
    ledger = CostLedger(BrokenStorage(), 'ds1', 'a', started=1000.0)
    ledger.save(1.0)
    assert ledger.read_others(1000.0) is None
    ledger.write_markers(['k'])


def test_cancel_keys_are_unique_per_attempt():
    ledger = CostLedger(FakeStorage(), 'ds1', 'a')
    assert ledger.new_cancel_key() != ledger.new_cancel_key()


def test_write_markers_puts_each_key():
    st = FakeStorage()
    CostLedger(st, 'ds1', 'a').write_markers(['m1', 'm2'])
    assert st.exists('m1') and st.exists('m2')


def test_check_passes_under_limit_and_raises_over():
    guard = CostGuard(10.0, CostLedger(FakeStorage(), 'ds1', 'a', started=0.0))
    guard.finish_attempt(4.0)
    guard.check(live_cost=5.9, now=1.0)
    with pytest.raises(CostLimitError) as e:
        guard.check(live_cost=6.1, now=2.0)
    assert e.value.spent == pytest.approx(10.1) and e.value.limit == 10.0


def test_trip_writes_markers_for_all_runs_of_dataset():
    st = FakeStorage()
    other = CostLedger(st, 'ds1', 'other', started=0.0)
    other_key = other.new_cancel_key()
    other.save(9.5)
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=0.0))
    key = guard.new_attempt()
    with pytest.raises(CostLimitError):
        guard.check(live_cost=1.0, now=1.0, force_sync=True)
    assert st.exists(key) and st.exists(other_key)


def test_trip_on_non_sync_tick_syncs_first_to_cancel_other_runs():
    st = FakeStorage()
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=0.0))
    key = guard.new_attempt()
    guard.check(now=0.0)  # first sync, no other runs yet
    other = CostLedger(st, 'ds1', 'other', started=0.0)
    other_key = other.new_cancel_key()
    other.save(0.0)
    with pytest.raises(CostLimitError):
        guard.check(live_cost=11.0, now=1.0)  # not a sync tick
    assert st.exists(key) and st.exists(other_key)


def test_failed_attempt_cancels_itself_and_adds_allowance():
    st = FakeStorage()
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=0.0))
    key = guard.new_attempt()
    guard.finish_attempt(1.0, failed=True, cancel_key=key, n_running=100, runtime_memory=8192)
    assert st.exists(key)
    assert guard.spent == pytest.approx(1.0 + lambda_cost(100 * CANCEL_ALLOWANCE * 8, 0))
    assert not st.exists(guard.new_attempt())  # next attempt is not cancelled


def test_ledger_synced_at_most_every_interval():
    st = CountingStorage()
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=0.0))
    for t in range(0, LEDGER_INTERVAL):  # 15 ticks within one interval
        guard.check(now=float(t))
    assert st.list_calls == 1
    guard.check(now=float(LEDGER_INTERVAL))
    assert st.list_calls == 2


def test_guard_fails_open_when_ledger_broken():
    guard = CostGuard(10.0, CostLedger(BrokenStorage(), 'ds1', 'a', started=0.0))
    guard.check(live_cost=1.0, now=1.0, force_sync=True)  # no raise
    guard.finish_attempt(1.0, failed=True, cancel_key=guard.new_attempt())  # no raise


class RaisingLedger:
    """Ledger stub whose every operation raises."""

    def new_cancel_key(self):
        return 'k'

    def save(self, cost, done=False):
        raise RuntimeError('save')

    def read_others(self, now):
        raise RuntimeError('read_others')

    def write_markers(self, keys):
        raise RuntimeError('write_markers')


def test_guard_own_except_handles_raising_ledger():
    guard = CostGuard(10.0, RaisingLedger())
    guard.new_attempt()
    guard.check(live_cost=1.0, now=1.0, force_sync=True)  # no raise
    guard.finish_attempt(1.0, failed=True, cancel_key='k')  # no raise
    with pytest.raises(CostLimitError):
        guard.check(live_cost=11.0, now=2.0)


def test_failed_ledger_read_keeps_last_known_others():
    st = FakeStorage()
    other = CostLedger(st, 'ds1', 'other', started=0.0)
    other_key = other.new_cancel_key()
    other.save(9.5)
    ledger = CostLedger(st, 'ds1', 'a', started=0.0)
    guard = CostGuard(10.0, ledger)
    guard.check(now=0.0)  # successful sync sees the other run
    ledger.read_others = lambda now: None  # simulate a failed listing
    guard.check(now=float(LEDGER_INTERVAL))  # sync tick, read fails, 9.5 still counted
    with pytest.raises(CostLimitError) as e:
        guard.check(live_cost=1.0, now=float(LEDGER_INTERVAL) + 1)
    assert e.value.spent == pytest.approx(10.5)
    assert st.exists(other_key)


def test_trip_cancelled_when_fresh_sync_drops_other_runs_cost():
    st = FakeStorage()
    other = CostLedger(st, 'ds1', 'other', started=0.0)
    other_key = other.new_cancel_key()
    other.save(9.5)
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=0.0))
    guard.check(now=0.0)  # caches others = 9.5
    st.objects.pop('cost_cap/ds1/runs/other.json')  # other run's record is gone
    guard.check(live_cost=1.0, now=1.0)  # stale total 10.5 > limit, fresh total 1.0: no raise
    assert not st.exists(other_key)


def test_broken_ledger_still_trips_on_local_spend():
    guard = CostGuard(10.0, CostLedger(BrokenStorage(), 'ds1', 'a', started=0.0))
    with pytest.raises(CostLimitError):
        guard.check(live_cost=11.0, now=1.0, force_sync=True)


@pytest.mark.parametrize(
    'cfg, ds_id, built',
    [({}, 'ds1', True), ({'max_cost_usd': None}, 'ds1', False), ({}, None, False)],
)
def test_build_guard(cfg, ds_id, built):
    assert (build_guard(cfg, FakeStorage(), ds_id) is not None) == built


def test_build_guard_zero_limit_builds_guard():
    guard = build_guard({'max_cost_usd': 0}, FakeStorage(), 'ds1')
    assert guard is not None
    with pytest.raises(CostLimitError):
        guard.check(live_cost=0.01, now=1.0)


def test_build_guard_fails_open_when_ledger_construction_fails(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError('boom')

    monkeypatch.setattr('sm.engine.annotation_lithops.cost_cap.CostLedger', boom)
    assert build_guard({}, FakeStorage(), 'ds1') is None


def test_build_guard_fails_open_on_malformed_limit():
    assert build_guard({'max_cost_usd': 'abc'}, FakeStorage(), 'ds1') is None


def test_watcher_exits_when_marker_appears(caplog):
    st = FakeStorage()
    codes = []
    start_cancel_watcher(st, st.bucket, 'k', interval=0.01, exit_fn=codes.append)
    time.sleep(0.05)
    assert codes == []
    with caplog.at_level('WARNING', logger='engine.cost-cap'):
        st.put_object(st.bucket, 'k', b'1')
        time.sleep(0.1)
    assert codes and codes[0] == 1
    assert any('cancel marker k' in r.getMessage() for r in caplog.records)


def test_watcher_ignores_storage_errors():
    codes = []
    thread = start_cancel_watcher(BrokenStorage(), 'b', 'k', interval=0.01, exit_fn=codes.append)
    time.sleep(0.05)
    assert codes == [] and thread.is_alive() and thread.daemon


def test_read_others_ignores_done_records():
    st = FakeStorage()
    done = CostLedger(st, 'ds1', 'done', started=1000.0)
    done.new_cancel_key()
    done.save(4.0, done=True)
    running = CostLedger(st, 'ds1', 'running', started=1000.0)
    running.new_cancel_key()
    running.save(2.0)
    cost, keys = CostLedger(st, 'ds1', 'b', started=1000.0).read_others(now=1000.0)
    assert cost == 2.0 and keys == ['cost_cap/ds1/cancel/running-1']


def test_finish_run_marks_record_done():
    st = FakeStorage()
    guard = CostGuard(10.0, CostLedger(st, 'ds1', 'a', started=1000.0))
    guard.finish_attempt(3.0)
    guard.finish_run()
    assert json.loads(st.objects['cost_cap/ds1/runs/a.json']) == {
        'started': 1000.0,
        'cost': 3.0,
        'cancel_keys': [],
        'done': True,
    }
    assert CostLedger(st, 'ds1', 'b', started=1000.0).read_others(1000.0)[0] == 0.0


def test_finish_run_fails_open():
    CostGuard(10.0, RaisingLedger()).finish_run()
    CostGuard(10.0, CostLedger(BrokenStorage(), 'ds1', 'a')).finish_run()


def test_read_others_does_not_fetch_records_old_by_last_modified():
    st = CountingStorage()
    old = CostLedger(st, 'ds1', 'old', started=1000.0)
    old.save(5.0)
    st.last_modified['cost_cap/ds1/runs/old.json'] = datetime.fromtimestamp(
        1000.0 - LEDGER_WINDOW - 60, timezone.utc
    )
    recent = CostLedger(st, 'ds1', 'recent', started=1000.0)
    recent.save(1.0)
    st.last_modified['cost_cap/ds1/runs/recent.json'] = datetime.fromtimestamp(
        1000.0 - 60, timezone.utc
    )
    st.get_calls = 0
    cost, _ = CostLedger(st, 'ds1', 'b', started=1000.0).read_others(now=1000.0)
    assert cost == 1.0 and st.get_calls == 1 and st.list_calls == 1


def test_read_others_reads_items_without_last_modified():
    st = CountingStorage()
    st.omit_last_modified = True
    CostLedger(st, 'ds1', 'a', started=1000.0).save(2.0)
    CostLedger(st, 'ds1', 'old', started=1000.0 - LEDGER_WINDOW - 1).save(9.0)
    st.get_calls = 0
    cost, _ = CostLedger(st, 'ds1', 'b', started=1000.0).read_others(now=1000.0)
    assert cost == 2.0 and st.get_calls == 2  # both fetched; the started check still applies


def test_watcher_checks_before_first_sleep():
    st = FakeStorage()
    st.put_object(st.bucket, 'k', b'1')
    codes = []
    start_cancel_watcher(st, st.bucket, 'k', interval=5, exit_fn=codes.append)
    deadline = time.time() + 1
    while not codes and time.time() < deadline:
        time.sleep(0.01)
    assert codes == [1]
