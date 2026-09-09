import logging
from datetime import datetime

import pytest

from sm.engine.postprocessing import cloudwatch
from sm.engine.postprocessing.cloudwatch import calc_costs, get_cloudwatch_logs

START = datetime(2026, 1, 1, 12, 0, 0)
FINISH = datetime(2026, 1, 1, 12, 1, 0)


def _report_record(request_id, billed_ms=100):
    message = (
        f'REPORT RequestId: {request_id}\tDuration: {billed_ms}.00 ms\t'
        f'Billed Duration: {billed_ms} ms\tMemory Size: 512 MB\tMax Memory Used: 50 MB'
    )
    return [
        {'field': '@timestamp', 'value': '2026-01-01 12:00:30.000'},
        {'field': '@message', 'value': message},
    ]


@pytest.fixture
def fake_cloudwatch(monkeypatch):
    """Replaces the raw CloudWatch fetch with a scripted sequence of poll results and makes
    sleeping instantaneous while still advancing a fake monotonic clock."""
    state = {'polls': [], 'sleeps': [], 'now': 0.0}

    def get_raw(*_args, **_kwargs):
        poll_idx = len(state['sleeps'])
        request_ids = state['polls'][min(poll_idx, len(state['polls']) - 1)]
        return [_report_record(r_id) for r_id in request_ids]

    def sleep(secs):
        state['sleeps'].append(secs)
        state['now'] += secs

    monkeypatch.setattr(cloudwatch, 'get_raw_cloudwatch_logs', get_raw)
    monkeypatch.setattr(cloudwatch.time, 'sleep', sleep)
    monkeypatch.setattr(cloudwatch.time, 'monotonic', lambda: state['now'])
    return state


def _run(request_ids, **kwargs):
    return get_cloudwatch_logs(None, ['/aws/lambda/test'], START, FINISH, request_ids, **kwargs)


def test_returns_immediately_when_all_records_present(fake_cloudwatch):
    fake_cloudwatch['polls'] = [['a', 'b']]

    response = _run({'a', 'b'})

    assert {r[1]['value'].split(' ')[2].split('\t')[0] for r in response} == {'a', 'b'}
    assert fake_cloudwatch['sleeps'] == []


def test_keeps_polling_while_records_are_still_arriving(fake_cloudwatch):
    fake_cloudwatch['polls'] = [[], ['a'], ['a', 'b']]

    response = _run({'a', 'b'})

    assert len(response) == 2
    assert fake_cloudwatch['sleeps'] == [cloudwatch.CLOUDWATCH_POLL_INTERVAL_SEC] * 2


def test_gives_up_when_no_record_ever_matches(fake_cloudwatch, caplog):
    fake_cloudwatch['polls'] = [[]]

    with caplog.at_level(logging.WARNING, logger='engine'):
        response = _run({'a', 'b'})

    assert response == []
    assert len(fake_cloudwatch['sleeps']) == cloudwatch.CLOUDWATCH_MAX_EMPTY_POLLS - 1
    assert '/aws/lambda/test' in caplog.text
    assert 'No CloudWatch records' in caplog.text


def test_gives_up_after_timeout_when_some_records_never_arrive(fake_cloudwatch, caplog):
    fake_cloudwatch['polls'] = [['a']]

    with caplog.at_level(logging.WARNING, logger='engine'):
        response = _run({'a', 'b'}, timeout_sec=100)

    assert len(response) == 1
    expected_sleeps = -(-100 // cloudwatch.CLOUDWATCH_POLL_INTERVAL_SEC)  # ceil
    assert len(fake_cloudwatch['sleeps']) == expected_sleeps
    assert 'Timed out' in caplog.text
    assert "'b'" in caplog.text


def test_no_lambda_runs_returns_without_polling(fake_cloudwatch):
    fake_cloudwatch['polls'] = [[]]

    assert _run(set()) == []
    assert fake_cloudwatch['sleeps'] == []


def test_calc_costs_treats_missing_records_as_zero_cost(caplog):
    entries = [
        {
            'id': 1,
            'name': 'step',
            'start': START,
            'finish': FINISH,
            'extra_data': {'runtime_memory': 1024, 'request_ids': ['a', 'missing']},
        }
    ]
    stats = {'a': {'duration_billed': 2.0}}

    with caplog.at_level(logging.WARNING, logger='engine'):
        costs = calc_costs(entries, stats)

    # 2 GB-seconds at 1 GB, plus 2 invocations
    assert costs == {1: pytest.approx(16.67e-6 * 2 + 0.20e-6 * 2)}
    assert 'missing' in caplog.text
