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
        if 'FROM public.roi' in sql or 'FROM roi' in sql:
            return self.roi_by_id.get(params[0])
        raise AssertionError(f'Unexpected SQL: {sql}')

    def select(self, sql, params=None):
        if 'FROM job' in sql:
            row = self.latest_job_by_ds.get(params[0])
            if row is None:
                return []
            return [row]
        if 'FROM annotation' in sql:
            return self.annotations_by_job.get(params[0], [])
        raise AssertionError(f'Unexpected SQL: {sql}')


def _img(values):
    return np.array(values, dtype=np.float32)


def test_build_prep_block_emits_per_sample_intensities_for_every_annotation():
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
    prep = build_prep_block(
        db,
        datasets,
        load_iso_image=load_iso,
        load_label_map=load_label_map_fail,
    )

    # The prep never filters: every annotation feeds the intensity blob and
    # the ion snapshot so later stats-only re-runs can pick any filter.
    assert prep['ions_total'] == 2
    # The ROIs are 2-vertex degenerate polygons — PIL fills them as a thin
    # line. Intensities keyed by regionKey, not sampleId.
    assert prep['intensities'] == {'r-s0': {11: 10.0, 12: 0.0}, 'r-s1': {11: 20.0, 12: 4.0}}
    assert len(prep['samples']) == 2
    assert prep['samples'][0]['regionKey'] == 'r-s0'
    assert prep['samples'][0]['sampleId'] == 's0'
    assert prep['samples'][0]['tic'] == 10.0
    assert prep['samples'][1]['regionKey'] == 'r-s1'
    assert prep['samples'][1]['tic'] == 24.0
    assert prep['filterChain'] == [{'name': 'All annotated ions', 'count': 2, 'droppedFromPrev': 0}]
    assert {e['ion_id'] for e in prep['all_ions']} == {11, 12}


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
        load_iso_image=lambda ds_id, iid: images[iid],
        load_label_map=lambda ds_id, sid: None,
    )
    assert [s['regionKey'] for s in prep['samples']] == ['r-mapped']
    assert 'r-unmapped' not in prep['intensities']


def _roi_db(annotations, n_regions):
    """Fake DB with one job and ``n_regions`` single-column ROI masks."""
    roi_by_id = {
        rid: (
            {
                'features': [
                    {
                        'properties': {
                            'id': rid,
                            'coordinates': [{'x': rid, 'y': 0}, {'x': rid, 'y': 1}],
                        }
                    }
                ]
            },
        )
        for rid in range(n_regions)
    }
    return _FakeDB(
        latest_job_by_ds={'ds-1': (101,)},
        annotations_by_job={101: annotations},
        roi_by_id=roi_by_id,
    )


def _roi_regions(n_regions):
    return [
        {
            'regionKey': f'r-{rid}',
            'sourceKind': 'roi',
            'roiId': rid,
            'segmentationId': None,
            'labelGroupName': 'g1',
            'metadata': {'sampleId': f's{rid}'},
        }
        for rid in range(n_regions)
    ]


def test_build_prep_block_keeps_at_most_one_iso_image_alive():
    """Memory must scale with regions x ions, never with ions x pixels.

    A dataset with thousands of annotations previously cached every decoded
    ion image for the whole dataset (multi-GB). Track how many loaded arrays
    are simultaneously alive via weakref finalizers.
    """
    import weakref

    n_images = 5
    annotations = [(i, 10 + i, 0.01, '+H', 9, [f'img-{i}']) for i in range(n_images)]
    base = {f'img-{i}': _img([[i, i + 1], [i + 2, i + 3]]) for i in range(n_images)}
    alive = {'now': 0, 'max': 0}

    def _released():
        alive['now'] -= 1

    def load_iso(ds_id, iid):
        arr = base[iid].copy()  # fresh object per load so finalizers are meaningful
        alive['now'] += 1
        alive['max'] = max(alive['max'], alive['now'])
        weakref.finalize(arr, _released)
        return arr

    datasets = [{'dataset_id': 'ds-1', 'region_source': 'roi', 'regions': _roi_regions(2)}]
    prep = build_prep_block(
        _roi_db(annotations, 2),
        datasets,
        load_iso_image=load_iso,
        load_label_map=lambda ds_id, sid: None,
    )

    assert alive['max'] <= 1, f'{alive["max"]} ion images were held in memory at once'
    # Behaviour unchanged: every ion gets a mean for every region.
    assert set(prep['intensities']) == {'r-0', 'r-1'}
    assert all(len(v) == n_images for v in prep['intensities'].values())
    # Column 0 of img-i is [i, i+2] -> mean i+1; column 1 is [i+1, i+3] -> mean i+2.
    assert prep['intensities']['r-0'][12] == 3.0
    assert prep['intensities']['r-1'][12] == 4.0


def test_default_load_iso_image_returns_owned_single_channel_float32():
    """The decoded PNG is RGBA; we must keep only channel 0 as an owned copy,
    not a view that pins the full 4-channel array in memory."""
    from io import BytesIO
    from unittest.mock import patch

    import PIL.Image

    from sm.engine.postprocessing.experiment_prep import _default_load_iso_image

    rgba = np.zeros((3, 4, 4), dtype=np.uint8)
    rgba[:, :, 0] = np.arange(12, dtype=np.uint8).reshape(3, 4)
    rgba[:, :, 3] = 255
    buf = BytesIO()
    PIL.Image.fromarray(rgba, 'RGBA').save(buf, format='PNG')

    with patch(
        'sm.engine.postprocessing.experiment_prep._image_storage.get_image',
        return_value=buf.getvalue(),
        create=True,  # module attribute only exists after image_storage.init()
    ):
        arr = _default_load_iso_image('ds-1', 'img-1')

    assert arr.shape == (3, 4)
    assert arr.dtype == np.float32
    assert arr.base is None, 'array must own its data, not be a view of the RGBA decode'
    assert arr.nbytes == 3 * 4 * 4
    np.testing.assert_array_equal(arr, np.arange(12, dtype=np.float32).reshape(3, 4))
