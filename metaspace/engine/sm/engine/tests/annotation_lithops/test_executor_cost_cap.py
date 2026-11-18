import inspect
import json
import logging
import contextlib
import threading
import time
import types

import pytest

import sm.engine.annotation_lithops.executor as executor_module
from sm.engine.annotation_lithops.cost_cap import CostLedger, ec2_cost
from sm.engine.annotation_lithops.executor import (
    Executor,
    LithopsStalledException,
    _build_wrapper_func,
)
from sm.engine.errors import CostLimitError
from sm.engine.tests.annotation_lithops.fakes import FakeStorage
from sm.engine.utils.perf_profile import NullProfiler


def raise_runtime_error(*args, **kwargs):
    raise RuntimeError('watcher failed to start')


def test_wrapper_without_cancel_is_unchanged():
    wrapper = _build_wrapper_func(lambda a: a + 1)
    assert 'storage' not in inspect.signature(wrapper).parameters and wrapper(1)[0] == 2


def test_wrapper_adds_storage_param_and_starts_watcher(monkeypatch):
    started = []
    monkeypatch.setattr(executor_module, 'start_cancel_watcher', lambda *a, **k: started.append(a))
    wrapper = _build_wrapper_func(lambda a: a + 1, cancel=('bucket', 'key'))
    assert 'storage' in inspect.signature(wrapper).parameters
    storage = FakeStorage()
    assert wrapper(1, storage=storage)[0] == 2 and started == [(storage, 'bucket', 'key')]


def test_wrapper_passes_storage_through_when_func_wants_it(monkeypatch):
    monkeypatch.setattr(executor_module, 'start_cancel_watcher', lambda *a, **k: None)
    storage = FakeStorage()
    wrapper = _build_wrapper_func(lambda a, storage: storage, cancel=('bucket', 'key'))
    assert wrapper(1, storage=storage)[0] is storage


def test_wrapper_survives_watcher_failure(monkeypatch):
    monkeypatch.setattr(executor_module, 'start_cancel_watcher', raise_runtime_error)
    wrapper = _build_wrapper_func(lambda a: a + 1, cancel=('bucket', 'key'))
    assert wrapper(1, storage=FakeStorage())[0] == 2


def test_wrapper_without_injected_storage_skips_watcher(monkeypatch):
    started = []
    monkeypatch.setattr(executor_module, 'start_cancel_watcher', lambda *a, **k: started.append(a))
    wrapper = _build_wrapper_func(lambda a: a + 1, cancel=('bucket', 'key'))
    assert wrapper(1)[0] == 2 and started == []


class FakeFuture:
    def __init__(self, running: bool, started_ago: float):
        now = time.time()
        self.running = running
        self.error = False
        self.activation_id = 'act'
        self.stats = {}
        self._call_status = {'worker_start_tstamp': now - started_ago}
        if not running:
            self._call_status['worker_end_tstamp'] = now


class FakeFutures(list):
    executor = None  # read by _save_subtask_perf


class FakeInvoker:
    def __init__(self, fake):
        self.fake = fake

    def stop(self):
        self.fake.invoker_stopped = True
        if self.fake.release_on_stop:
            self.fake.release.set()


class FakeLithopsExecutor:
    """Stands in for a Lithops executor; get_result runs the wrapper in-process."""

    def __init__(
        self,
        hang=False,
        n_running=1,
        fail_first_with=None,
        map_raises=None,
        standalone=False,
        release_on_stop=False,
        release_error=None,
    ):  # pylint: disable=too-many-arguments
        self.invoker = FakeInvoker(self)
        self.config = {'lithops': {'mode': 'standalone' if standalone else 'serverless'}}
        master = types.SimpleNamespace(public_ip='1.2.3.4', stop=lambda: None)
        backend = types.SimpleNamespace(master=master)
        self.invoker.compute_handler = types.SimpleNamespace(backend=backend)
        self.compute_handler = self.invoker.compute_handler
        self.release_on_stop = release_on_stop
        self.release_error = release_error
        self.invoker_stopped = False
        self.hang = hang
        self.n_running = n_running
        self.fail_first_with = fail_first_with
        self.map_raises = map_raises
        self.map_calls = 0
        self.cancel_keys = []
        self.last_func_signature = None
        self.release = threading.Event()
        self._args = []

    def map(self, func, args, runtime_memory=None, **kwargs):
        self.map_calls += 1
        if self.map_raises is not None:
            raise self.map_raises
        self.last_func_signature = inspect.signature(func)
        if 'cancel' in func.__code__.co_freevars:
            cell = func.__closure__[func.__code__.co_freevars.index('cancel')]
            if cell.cell_contents is not None:
                self.cancel_keys.append(cell.cell_contents[1])
        self._func = func
        self._args = args
        running = self.hang
        n = self.n_running if self.hang else len(args)
        return FakeFutures(FakeFuture(running, 100 if running else 1) for _ in range(n))

    def get_result(self, futures):
        if self.hang:
            self.release.wait(30)
            if self.release_error is not None:
                time.sleep(0.05)  # let the watchdog return first
                raise self.release_error
            raise RuntimeError('released')
        if self.fail_first_with is not None and self.map_calls == 1:
            raise self.fail_first_with
        return [self._func(*a) for a in self._args]


def make_executor(
    monkeypatch,
    ds_id='ds1',
    max_cost_usd=10,
    execution_timeout=None,
    other_runs_cost=None,
    **fake_kwargs,
):
    fake = FakeLithopsExecutor(**fake_kwargs)
    key = 'aws_ec2_32' if fake_kwargs.get('standalone') else 'aws_lambda'
    storage = FakeStorage()
    monkeypatch.setattr(executor_module, 'generate_aws_executors', lambda cfg: {key: fake})
    monkeypatch.setattr(executor_module, 'Storage', lambda cfg: storage)
    monkeypatch.setattr(executor_module, 'WATCHDOG_INTERVAL', 0.01)
    monkeypatch.setattr(executor_module, 'start_cancel_watcher', lambda *a, **k: None)
    config = {'lithops': {'mode': 'hybrid'}, 'max_cost_usd': max_cost_usd}
    ex = Executor(config, ds_id=ds_id)
    ex.fake = fake
    ex.storage = storage
    if execution_timeout is not None:
        ex._execution_timeout = execution_timeout
    if other_runs_cost is not None:
        CostLedger(storage, ds_id, 'other', started=time.time()).save(other_runs_cost)
    return ex


def add_one(a):
    return a + 1


def test_no_ds_id_means_no_guard_and_plain_wrapper(monkeypatch):
    ex = make_executor(monkeypatch, ds_id=None)
    assert ex._cost_guard is None and ex.map(add_one, [(1,)]) == [2]
    assert 'storage' not in ex.fake.last_func_signature.parameters


def test_cap_disabled_by_null(monkeypatch):
    assert make_executor(monkeypatch, ds_id='ds1', max_cost_usd=None)._cost_guard is None


def test_map_under_limit_returns_results_and_records_cost(monkeypatch):
    ex = make_executor(monkeypatch)
    assert ex.map(add_one, [(1,), (2,)]) == [2, 3]
    assert ex._cost_guard.spent > 0


def test_watchdog_trips_while_step_is_running(monkeypatch):
    ex = make_executor(monkeypatch, max_cost_usd=0.001, hang=True, n_running=50)
    try:
        with pytest.raises(CostLimitError):
            ex.map(add_one, [(i,) for i in range(50)], runtime_memory=8192)
        assert ex.storage.exists(ex.fake.cancel_keys[0]) and ex.fake.invoker_stopped
        assert ex.fake.map_calls == 1  # no doubling after a trip
    finally:
        ex.fake.release.set()


def test_failed_attempt_cancels_leftovers_and_next_attempt_has_new_key(monkeypatch):
    ex = make_executor(monkeypatch, fail_first_with=MemoryError())
    ex.map(add_one, [(1,)], runtime_memory=512)
    first, second = ex.fake.cancel_keys
    assert first != second and ex.storage.exists(first) and not ex.storage.exists(second)


def test_over_budget_before_dispatch_starts_nothing(monkeypatch):
    ex = make_executor(monkeypatch, max_cost_usd=1.0, other_runs_cost=5.0)
    with pytest.raises(CostLimitError):
        ex.map(add_one, [(1,)])
    assert ex.fake.map_calls == 0


def test_map_raising_before_futures_exist_does_not_crash_accounting(monkeypatch):
    ex = make_executor(monkeypatch, map_raises=ValueError('boom'))
    with pytest.raises(ValueError):
        ex.map(add_one, [(1,)])


def test_broken_tick_does_not_break_map(monkeypatch):
    ex = make_executor(monkeypatch, hang=False)
    monkeypatch.setattr(executor_module, 'estimate_attempt', raise_runtime_error)
    assert ex.map(add_one, [(1,)]) == [2]


def test_stall_timeout_still_raises(monkeypatch):
    ex = make_executor(monkeypatch, hang=True, execution_timeout=0.05, max_cost_usd=1e9)
    try:
        with pytest.raises(LithopsStalledException):
            ex.map(add_one, [(1,)])
    finally:
        ex.fake.release.set()


class RecordingProfiler(NullProfiler):
    def __init__(self):
        self.entries = []

    def record_entry(self, name, start=None, finish=None, **extra_data):
        self.entries.append((name, extra_data))


def test_trip_is_not_overwritten_by_late_worker_exception(monkeypatch):
    ex = make_executor(
        monkeypatch,
        max_cost_usd=0.001,
        hang=True,
        n_running=50,
        release_on_stop=True,
        release_error=OSError('late'),
    )
    real_final_cost = Executor._final_cost

    def slow_final_cost(*args):
        time.sleep(0.3)  # the worker raises while the main thread is still accounting
        return real_final_cost(*args)

    monkeypatch.setattr(Executor, '_final_cost', staticmethod(slow_final_cost))
    ex._perf = RecordingProfiler()
    with pytest.raises(CostLimitError):
        ex.map(add_one, [(i,) for i in range(50)], runtime_memory=8192)
    assert ex.fake.map_calls == 1
    # the attempt's recorded error is the trip, not the worker's late OSError
    assert [e[1]['error']['type'] for e in ex._perf.entries] == ['CostLimitError']


def test_trip_records_perf_entry(monkeypatch):
    ex = make_executor(monkeypatch, max_cost_usd=0.001, hang=True, n_running=50)
    ex._perf = RecordingProfiler()
    try:
        with pytest.raises(CostLimitError):
            ex.map(add_one, [(i,) for i in range(50)], runtime_memory=8192)
        assert len(ex._perf.entries) == 1
        assert ex._perf.entries[0][1]['error']['type'] == 'CostLimitError'
    finally:
        ex.fake.release.set()


def test_stall_timeout_without_guard(monkeypatch):
    ex = make_executor(monkeypatch, ds_id=None, hang=True, execution_timeout=0.05)
    try:
        with pytest.raises(LithopsStalledException):
            ex.map(add_one, [(1,)])
    finally:
        ex.fake.release.set()


def test_ec2_billing_starts_after_mutex_acquired(monkeypatch):
    mutex_released = threading.Event()

    class FakeDBMutex:
        @contextlib.contextmanager
        def lock(self, name, timeout):
            mutex_released.wait(30)
            yield

    monkeypatch.setattr('sm.engine.utils.db_mutex.DBMutex', FakeDBMutex)
    monkeypatch.setattr(
        executor_module,
        'time',
        types.SimpleNamespace(
            time=time.time, monotonic=time.monotonic, sleep=lambda s: None  # skip the 5s EC2 wait
        ),
    )
    ex = make_executor(monkeypatch, max_cost_usd=1e-5, standalone=True)
    live_costs = []
    real_check = ex._cost_guard.check

    def recording_check(live_cost=0.0, **kw):
        # Only ticks observed while the mutex is still held count: live_cost was computed before
        # this call, so a tick that sees the mutex unreleased cannot have billed anything yet.
        if not mutex_released.is_set():
            live_costs.append(live_cost)
        return real_check(live_cost, **kw)

    ex._cost_guard.check = recording_check
    timer = threading.Timer(0.4, mutex_released.set)
    timer.start()
    try:
        assert ex.map(add_one, [(1,)], runtime_memory=32768) == [2]
    finally:
        timer.cancel()
    assert len(live_costs) >= 5 and all(c == 0 for c in live_costs)
    assert ex._cost_guard.spent < ec2_cost(32768, 0.2)


def test_finish_cost_tracking_marks_record_done(monkeypatch):
    ex = make_executor(monkeypatch)
    ex.map(add_one, [(1,)])
    key = f'cost_cap/ds1/runs/{ex._cost_guard.ledger.run_id}.json'
    assert (
        'done' not in json.loads(ex.storage.objects[key])
        or not json.loads(ex.storage.objects[key])['done']
    )
    ex.finish_cost_tracking()
    assert json.loads(ex.storage.objects[key])['done'] is True


def test_finish_cost_tracking_without_guard_is_noop(monkeypatch):
    ex = make_executor(monkeypatch, ds_id=None)
    ex.finish_cost_tracking()
    assert ex.storage.objects == {}


def test_finish_cost_tracking_fails_open(monkeypatch):
    ex = make_executor(monkeypatch)

    def boom():
        raise RuntimeError('boom')

    ex._cost_guard.finish_run = boom
    ex.finish_cost_tracking()


def test_record_lists_cancel_key_right_after_begin_attempt(monkeypatch):
    ex = make_executor(monkeypatch)
    _, cancel_key = ex._begin_attempt(add_one, add_one, ex._cost_guard)
    key = f'cost_cap/ds1/runs/{ex._cost_guard.ledger.run_id}.json'
    assert json.loads(ex.storage.objects[key])['cancel_keys'] == [cancel_key]


def test_pre_dispatch_trip_logs_function_and_amounts(monkeypatch, caplog):
    ex = make_executor(monkeypatch, max_cost_usd=1.0, other_runs_cost=5.0)
    with caplog.at_level(logging.WARNING, logger='engine.lithops-wrapper'):
        with pytest.raises(CostLimitError):
            ex.map(add_one, [(1,)])
    messages = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any('add_one' in m and '5.00' in m and '1.00' in m for m in messages), messages
