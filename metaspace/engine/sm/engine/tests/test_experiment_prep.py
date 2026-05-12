"""Unit tests for experiment_prep.build_prep_block.

DB and image-loading hooks are faked here. Real-DB + real image_storage
integration coverage lives in
metaspace/engine/tests/test_experiment_prep_integration.py.
"""
import numpy as np

from sm.engine.postprocessing.experiment_prep import build_prep_block


class _FakeDB:
    """Multi-call fake; dispatches on the SQL prefix it sees."""

    def __init__(self, *, latest_job_by_ds, annotations_by_job, roi_by_id):
        self.latest_job_by_ds = latest_job_by_ds
        self.annotations_by_job = annotations_by_job
        self.roi_by_id = roi_by_id

    def select_one(self, sql, params=None):
        if 'FROM job' in sql:
            return self.latest_job_by_ds.get(params[0])
        if 'FROM public.roi' in sql or 'FROM roi' in sql:
            return self.roi_by_id.get(params[0])
        raise AssertionError(f'Unexpected SQL: {sql}')

    def select(self, sql, params=None):
        if 'FROM annotation' in sql:
            return self.annotations_by_job.get(params[0], [])
        raise AssertionError(f'Unexpected SQL: {sql}')


def _img(values):
    return np.array(values, dtype=np.float32)


def test_build_prep_block_emits_per_sample_intensities_and_filter_chain():
    annotations = [
        # (annotation_id, ion_id, fdr, adduct, moldb_id, iso_image_ids list)
        (1, 11, 0.05, '+H', 9, ['img-a']),
        (2, 12, 0.20, '+H', 9, ['img-b']),
    ]
    db = _FakeDB(
        latest_job_by_ds={'ds-1': (101,)},
        annotations_by_job={101: annotations},
        roi_by_id={
            42: (
                {
                    'features': [
                        {
                            'properties': {
                                'id': 42,
                                'coordinates': [{'x': 0, 'y': 0}, {'x': 0, 'y': 1}],
                            }
                        }
                    ]
                },
            ),
            43: (
                {
                    'features': [
                        {
                            'properties': {
                                'id': 43,
                                'coordinates': [{'x': 1, 'y': 0}, {'x': 1, 'y': 1}],
                            }
                        }
                    ]
                },
            ),
        },
    )
    images = {
        'img-a': _img([[10, 20], [10, 20]]),
        'img-b': _img([[0, 4], [0, 4]]),
    }
    load_iso = lambda ds_id, iid: images[iid]

    def load_label_map_fail(ds_id, seg_id):
        raise AssertionError('label_map should not be loaded for ROI regions')

    datasets = [
        {
            'dataset_id': 'ds-1',
            'region_source': 'roi',
            'regions': [
                {
                    'regionKey': 'r-s0',
                    'sourceKind': 'roi',
                    'roiId': 42,
                    'segmentationId': None,
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's0'},
                },
                {
                    'regionKey': 'r-s1',
                    'sourceKind': 'roi',
                    'roiId': 43,
                    'segmentationId': None,
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's1'},
                },
            ],
        }
    ]
    filters = {'fdr': 0.10, 'moldb_ids': [9], 'adducts': ['+H']}

    prep = build_prep_block(
        db,
        datasets,
        filters,
        load_iso_image=load_iso,
        load_label_map=load_label_map_fail,
    )

    assert prep['ions_total'] == 1
    # The ROIs are 2-vertex degenerate polygons — PIL fills them as a thin
    # line. Intensities now keyed by regionKey, not sampleId.
    assert prep['intensities'] == {'r-s0': {11: 10.0}, 'r-s1': {11: 20.0}}
    assert len(prep['samples']) == 2
    assert prep['samples'][0]['regionKey'] == 'r-s0'
    assert prep['samples'][0]['sampleId'] == 's0'
    assert prep['samples'][0]['tic'] == 10.0
    assert prep['samples'][1]['regionKey'] == 'r-s1'
    assert prep['samples'][1]['tic'] == 20.0
    chain = prep['filterChain']
    assert [step['name'] for step in chain] == [
        'All annotated ions',
        '+FDR <= 0.1',
        '+DB allow-list',
        '+adduct allow-list',
    ]
    assert [step['count'] for step in chain] == [2, 1, 1, 1]
    assert chain[1]['droppedFromPrev'] == 1


def test_build_prep_block_handles_segmentation_cluster_regions():
    annotations = [(1, 11, 0.01, '+H', 9, ['img-a'])]
    db = _FakeDB(
        latest_job_by_ds={'ds-1': (101,)},
        annotations_by_job={101: annotations},
        roi_by_id={},
    )
    iso_images = {'img-a': _img([[10, 20], [30, 40]])}
    label_maps = {('ds-1', 'seg-uuid'): (np.array([[0, 1], [1, 0]], dtype=np.int32), 1)}

    datasets = [
        {
            'dataset_id': 'ds-1',
            'region_source': 'segmentation',
            'regions': [
                {
                    'regionKey': 'r-s0',
                    'sourceKind': 'segmentation_cluster',
                    'roiId': None,
                    'segmentationId': 'seg-uuid',
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's0'},
                },
            ],
        }
    ]
    prep = build_prep_block(
        db,
        datasets,
        {},
        load_iso_image=lambda ds_id, iid: iso_images[iid],
        load_label_map=lambda ds_id, sid: label_maps[(ds_id, sid)],
    )
    # cluster 1 is at (y=0,x=1) and (y=1,x=0): values 20 and 30, mean 25.
    assert prep['intensities'] == {'r-s0': {11: 25.0}}


def test_build_prep_block_skips_regions_without_label_group():
    annotations = [(1, 11, 0.01, '+H', 9, ['img-a'])]
    db = _FakeDB(
        latest_job_by_ds={'ds-1': (101,)},
        annotations_by_job={101: annotations},
        roi_by_id={
            42: (
                {
                    'features': [
                        {
                            'properties': {
                                'id': 42,
                                'coordinates': [{'x': 0, 'y': 0}, {'x': 0, 'y': 1}],
                            }
                        }
                    ]
                },
            ),
            43: (
                {
                    'features': [
                        {
                            'properties': {
                                'id': 43,
                                'coordinates': [{'x': 1, 'y': 0}, {'x': 1, 'y': 1}],
                            }
                        }
                    ]
                },
            ),
        },
    )
    images = {'img-a': _img([[10, 20], [10, 20]])}
    datasets = [
        {
            'dataset_id': 'ds-1',
            'region_source': 'roi',
            'regions': [
                {
                    'regionKey': 'r-mapped',
                    'sourceKind': 'roi',
                    'roiId': 42,
                    'segmentationId': None,
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's0'},
                },
                {
                    'regionKey': 'r-unmapped',
                    'sourceKind': 'roi',
                    'roiId': 43,
                    'segmentationId': None,
                    'labelGroupName': None,
                    'metadata': {'sampleId': 's1'},
                },
            ],
        }
    ]
    prep = build_prep_block(
        db,
        datasets,
        {},
        load_iso_image=lambda ds_id, iid: images[iid],
        load_label_map=lambda ds_id, sid: None,
    )
    assert [s['regionKey'] for s in prep['samples']] == ['r-mapped']
    assert 'r-unmapped' not in prep['intensities']
