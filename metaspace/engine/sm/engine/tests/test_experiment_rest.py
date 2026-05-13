"""Unit tests for the experiment REST endpoints in :mod:`sm.rest.experiment`."""

from unittest.mock import patch

import pytest

from sm.rest import experiment

try:
    from webtest import TestApp

    HAS_WEBTEST = True
except ImportError:  # pragma: no cover - webtest is optional
    HAS_WEBTEST = False


@patch('sm.rest.experiment.DB')
@patch('sm.rest.experiment.ExperimentManager')
def test_run_stats_endpoint_invokes_manager(MockManager, _MockDB):
    """``POST /run_stats`` forwards params to ``ExperimentManager.run_stats_only``."""
    instance = MockManager.return_value
    instance.run_stats_only.return_value = {
        'experiment_id': 'exp-1',
        'run_generation': 3,
    }
    experiment.init({'image_storage': {'bucket': 'b'}})

    if HAS_WEBTEST:
        client = TestApp(experiment.app)
        body = {
            'experiment_id': 'exp-1',
            'run_generation': 3,
            'filter': {'fdrMax': 0.1},
            'excluded_samples': ['s1'],
        }
        resp = client.post_json('/run_stats', body)
        assert resp.status_code == 200
    else:
        with patch(
            'sm.rest.experiment.body_to_json',
            return_value={
                'experiment_id': 'exp-1',
                'run_generation': 3,
                'filter': {'fdrMax': 0.1},
                'excluded_samples': ['s1'],
            },
        ):
            callback = None
            for route in experiment.app.routes:
                if route.rule == '/run_stats':
                    callback = route.callback
                    break
            if callback is None:
                pytest.fail('route /run_stats not registered')
            callback()

    instance.run_stats_only.assert_called_once_with(
        experiment_id='exp-1',
        run_generation=3,
        filter={'fdrMax': 0.1},
        excluded_samples=['s1'],
    )
