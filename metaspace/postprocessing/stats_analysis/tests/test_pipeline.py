"""Smoke test: pipeline.run_experiment delegates to the real runner."""
from tests.fixtures import make_payload

from stats_analysis.pipeline import run_experiment


def test_pipeline_delegates_to_runner_and_returns_full_shape():
    out = run_experiment('exp-1', 1, make_payload())
    assert out['inferred_test'] in {'WILCOXON_UNPAIRED', 'WILCOXON_PAIRED', 'NOT_ENOUGH_DATA'}
    assert 'samples' in out['run_qc']
    assert 'pcaVariance' in out['run_qc']
    assert 'filterChain' in out['run_qc']
    assert 'coverage' in out['run_qc']
    assert len(out['results']) > 0
