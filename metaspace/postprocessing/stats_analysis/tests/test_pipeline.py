"""Smoke test: pipeline.run_experiment_prep delegates to the real runner."""
from unittest.mock import patch

from tests.fixtures import make_payload

from stats_analysis.pipeline import run_experiment_prep, run_experiment_stats
from stats_analysis import runner as runner_mod


def test_pipeline_delegates_to_runner_and_returns_full_shape():
    out = run_experiment_prep('exp-1', 1, make_payload())
    assert out['inferred_test'] in {'LIMMA', 'NOT_ENOUGH_DATA'}
    assert 'samples' in out['run_qc']
    assert 'pcaVariance' in out['run_qc']
    assert 'filterChain' in out['run_qc']
    assert 'coverage' in out['run_qc']
    assert len(out['results']) > 0


@patch.object(runner_mod, '_fetch_intensity_blob')
def test_stats_only_excludes_samples_and_strips_intensity_rows(fetch):
    fetch.return_value = [
        {'ion_id': 1, 'region_key': 'r1', 'intensity': 10.0},
        {'ion_id': 1, 'region_key': 'r2', 'intensity': 20.0},
        {'ion_id': 2, 'region_key': 'r1', 'intensity': 5.0},
        {'ion_id': 2, 'region_key': 'r2', 'intensity': 0.0},
    ]
    payload = {
        'experiment_id': 'exp-1',
        'run_generation': 3,
        'intensity_blob_s3_key': 'experiments/exp-1/3/intensities.json.gz',
        'filter': {},
        'excluded_samples': ['sampleA'],
        'label_groups': [{'name': 'LG', 'color': '#000'}],
        'datasets': [
            {
                'dataset_id': 'd1',
                'region_source': 'WHOLE',
                'regions': [
                    {
                        'regionKey': 'r1',
                        'labelGroupName': 'LG',
                        'metadata': {
                            'sampleId': 'sampleA',
                            'condition': 'A',
                            'biologicalReplicateId': 'b1',
                        },
                    },
                    {
                        'regionKey': 'r2',
                        'labelGroupName': 'LG',
                        'metadata': {
                            'sampleId': 'sampleB',
                            'condition': 'B',
                            'biologicalReplicateId': 'b1',
                        },
                    },
                ],
            },
        ],
    }
    result = run_experiment_stats('exp-1', 3, payload)
    assert 'intensity_rows' not in result
    assert 'results' in result


@patch.object(runner_mod, '_fetch_intensity_blob')
def test_reconstruct_prep_drops_excluded_samples(fetch):
    from stats_analysis.runner import _reconstruct_prep_from_blob

    blob = [
        {'ion_id': 1, 'region_key': 'r1', 'intensity': 1.0},
        {'ion_id': 1, 'region_key': 'r2', 'intensity': 2.0},
    ]
    datasets = [
        {
            'dataset_id': 'd',
            'region_source': 'WHOLE',
            'regions': [
                {'regionKey': 'r1', 'metadata': {'sampleId': 'A'}},
                {'regionKey': 'r2', 'metadata': {'sampleId': 'B'}},
            ],
        },
    ]
    prep = _reconstruct_prep_from_blob(blob, datasets, ['A'])
    sample_ids = [s['sampleId'] for s in prep['samples']]
    assert sample_ids == ['B']
    assert 'r1' not in prep['intensities']
    assert 'r2' in prep['intensities']
