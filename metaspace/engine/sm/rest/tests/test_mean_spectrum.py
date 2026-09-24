"""Tests for the mean spectrum reference-axis construction.

The load-bearing test here is `test_matches_naive_reference`: the production
implementation adds a vectorised gap pre-pass and reduceat aggregation on top of
MALDIquant's strict rule, and those must not change the result relative to a direct
transcription of the algorithm.
"""

# pylint: disable=protected-access
from io import BytesIO
from types import MethodType, SimpleNamespace
from unittest.mock import MagicMock

import numpy as np
import pytest

from sm.engine.annotation.isocalc_wrapper import mass_accuracy_half_width
from sm.rest import mean_spectrum_manager
from sm.rest.mean_spectrum_manager import (
    MeanSpectrumManager,
    _format_peak_count,
    build_reference_axis_strict,
    select_top_peaks,
)

INSTRUMENTS = ['TOF', 'Orbitrap', 'FTICR']


def naive_reference_axis(mzs, ints, pix, instrument, ppm, n_pixels, min_support_frac=0.01):
    """Direct transcription of the spec's pseudocode -- no pre-pass, no vectorisation."""
    mzs = np.asarray(mzs, dtype=np.float64)
    ints = np.asarray(ints, dtype=np.float64)
    pix = np.asarray(pix)
    if len(mzs) == 0:
        return np.array([]), np.array([]), np.array([], dtype=np.int64)

    clusters = []
    stack = [np.arange(len(mzs))]
    while stack:
        idx = stack.pop()
        if len(idx) == 1:
            clusters.append(idx)
            continue

        sub_mzs = mzs[idx]
        tol = mass_accuracy_half_width(float(sub_mzs.mean()), instrument, ppm)
        within_tol = (sub_mzs.max() - sub_mzs.min()) <= tol
        no_dup_pixels = len(np.unique(pix[idx])) == len(idx)

        if within_tol and no_dup_pixels:
            clusters.append(idx)
            continue

        split_at = int(np.argmax(np.diff(sub_mzs))) + 1
        stack.append(idx[:split_at])
        stack.append(idx[split_at:])

    clusters.sort(key=lambda c: c[0])
    ref_mzs, agg_int, support = [], [], []
    for idx in clusters:
        w = ints[idx]
        ref_mzs.append(np.average(mzs[idx], weights=w) if w.sum() > 0 else mzs[idx][0])
        agg_int.append(w.sum())
        support.append(len(np.unique(pix[idx])))

    ref_mzs = np.array(ref_mzs)
    agg_int = np.array(agg_int)
    support = np.array(support, dtype=np.int64)

    keep = support >= max(3, min_support_frac * n_pixels)
    return ref_mzs[keep], agg_int[keep], support[keep]


def _random_peaks(rng, n_pixels, peaks_per_pixel, scatter_ppm, mz_range=(100.0, 900.0)):
    """Peaks from `n_pixels` pixels around shared true masses, with per-spectrum scatter."""
    true_mzs = rng.uniform(*mz_range, size=peaks_per_pixel)
    mzs, pix, ints = [], [], []
    for p in range(n_pixels):
        jitter = true_mzs * (1 + rng.normal(0, scatter_ppm * 1e-6, size=peaks_per_pixel))
        mzs.append(jitter)
        pix.append(np.full(peaks_per_pixel, p))
        ints.append(rng.uniform(1, 1000, size=peaks_per_pixel))

    mzs = np.concatenate(mzs)
    pix = np.concatenate(pix)
    ints = np.concatenate(ints)
    order = np.argsort(mzs, kind='stable')
    return mzs[order], ints[order], pix[order]


@pytest.mark.parametrize('instrument', INSTRUMENTS)
@pytest.mark.parametrize('scatter_ppm', [1.0, 5.0, 25.0])
def test_matches_naive_reference(instrument, scatter_ppm):
    """The pre-pass and reduceat rewrite must be exactly equivalent to the plain rule."""
    rng = np.random.default_rng(42)
    n_pixels = 40
    mzs, ints, pix = _random_peaks(rng, n_pixels, peaks_per_pixel=30, scatter_ppm=scatter_ppm)

    got = build_reference_axis_strict(mzs, ints, pix, instrument, ppm=3.0, n_pixels=n_pixels)
    expected = naive_reference_axis(mzs, ints, pix, instrument, ppm=3.0, n_pixels=n_pixels)

    np.testing.assert_allclose(got[0], expected[0], rtol=1e-12)
    np.testing.assert_allclose(got[1], expected[1], rtol=1e-12)
    np.testing.assert_array_equal(got[2], expected[2])


def test_empty_input():
    ref_mzs, ints, support = build_reference_axis_strict(
        np.array([]), np.array([]), np.array([]), 'TOF', 3.0, n_pixels=10
    )
    assert len(ref_mzs) == 0 and len(ints) == 0 and len(support) == 0


def test_single_peak_is_filtered_by_support_floor():
    """One peak means support=1, below the absolute floor of 3."""
    ref_mzs, _, _ = build_reference_axis_strict(
        np.array([200.0]), np.array([5.0]), np.array([0]), 'TOF', 3.0, n_pixels=1
    )
    assert len(ref_mzs) == 0


def test_identical_mzs_collapse_to_one_cluster():
    """The continuous-mode shape: every pixel reports the exact same m/z."""
    n_pixels = 10
    mzs = np.full(n_pixels, 300.0)
    ints = np.arange(1, n_pixels + 1, dtype=float)
    pix = np.arange(n_pixels)

    ref_mzs, summed, support = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 3.0, n_pixels=n_pixels
    )

    assert len(ref_mzs) == 1
    assert ref_mzs[0] == pytest.approx(300.0)
    assert summed[0] == pytest.approx(ints.sum())
    assert support[0] == n_pixels


def test_strict_rule_splits_duplicate_pixel():
    """Two peaks from one pixel within tolerance must not share a cluster."""
    # 4 pixels' worth of peaks tightly around 400.0, but pixel 0 contributes twice.
    mzs = np.array([399.9990, 399.9995, 400.0000, 400.0005, 400.0010])
    ints = np.ones(5)
    pix = np.array([0, 0, 1, 2, 3])

    # A generous 100 ppm window comfortably spans all five peaks, so only the strict
    # duplicate-pixel rule can force a split here.
    _, _, support = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 100.0, n_pixels=4, min_support_pixels=1
    )
    assert len(support) >= 2
    assert support.sum() == 5


def test_support_filter_fraction_applies_on_large_region():
    """1% of 1000 pixels = 10, so a 5-pixel cluster is dropped."""
    mzs = np.linspace(500.0, 500.000004, 5)
    ints = np.ones(5)
    pix = np.arange(5)

    ref_mzs, _, _ = build_reference_axis_strict(mzs, ints, pix, 'TOF', 3.0, n_pixels=1000)
    assert len(ref_mzs) == 0

    ref_mzs, _, _ = build_reference_axis_strict(mzs, ints, pix, 'TOF', 3.0, n_pixels=100)
    assert len(ref_mzs) == 1


def test_intensity_weighted_centroid():
    """The reported m/z is the intensity-weighted centroid, not the most intense peak."""
    mzs = np.array([400.0000, 400.0004, 400.0008])
    ints = np.array([1.0, 1.0, 2.0])
    pix = np.array([0, 1, 2])

    ref_mzs, summed, _ = build_reference_axis_strict(
        mzs, ints, pix, 'TOF', 10.0, n_pixels=3, min_support_pixels=1
    )
    assert len(ref_mzs) == 1
    assert ref_mzs[0] == pytest.approx(np.average(mzs, weights=ints))
    # ...and is distinguishable from the most intense peak's raw m/z
    assert abs(ref_mzs[0] - 400.0008) > 1e-5
    assert summed[0] == pytest.approx(4.0)


def test_select_top_peaks_returns_mz_sorted_subset():
    ref_mzs = np.array([100.0, 200.0, 300.0, 400.0, 500.0])
    summed = np.array([5.0, 1.0, 4.0, 2.0, 3.0])
    support = np.array([5, 1, 4, 2, 3], dtype=np.int64)

    got_mzs, got_ints, got_support = select_top_peaks(ref_mzs, summed, support, max_points=3)

    assert got_mzs.tolist() == [100.0, 300.0, 500.0]
    assert got_ints.tolist() == [5.0, 4.0, 3.0]
    assert got_support.tolist() == [5, 4, 3]
    assert np.all(np.diff(got_mzs) > 0)


@pytest.mark.parametrize(
    'n, expected',
    [
        (102_216_984, 'over 100 million'),
        (30_000_000, '30 million'),
        (10_000_000, '10 million'),
        (8_432_100, 'over 8 million'),
        (45_678_901, 'over 45 million'),
        (999_999, '999,999'),
    ],
)
def test_format_peak_count(n, expected):
    assert _format_peak_count(n) == expected


def test_select_top_peaks_passthrough_when_under_cap():
    ref_mzs = np.array([1.0, 2.0])
    summed = np.array([1.0, 2.0])
    support = np.array([1, 2], dtype=np.int64)

    got = select_top_peaks(ref_mzs, summed, support, max_points=10)
    np.testing.assert_array_equal(got[0], ref_mzs)


# ---------------------------------------------------------------------------
# MeanSpectrumManager: region-aware availability, region reads, budget
# ---------------------------------------------------------------------------


DS = '2020-01-01_00h00m00s'
# two acquired pixels: spectrum 0 -> pixel 0 with 3 peaks, spectrum 1 -> pixel 1 with 4 peaks
READER = SimpleNamespace(
    coordinates=[(1, 1, 1), (2, 1, 1)],
    mzOffsets=[16, 40],
    mzLengths=[3, 4],
    intensityOffsets=[100, 112],
    intensityLengths=[3, 4],
    mzPrecision='d',
    intensityPrecision='f',
)


def _manager(monkeypatch, masks, total_peaks=50_000_000, caps=None):
    monkeypatch.setattr(mean_spectrum_manager, 'MEAN_SPECTRUM_MAX_REGION_PEAKS', 5)
    for name, value in (caps or {}).items():
        monkeypatch.setattr(mean_spectrum_manager, name, value)
    db = MagicMock()
    db.select.return_value = [(1, 'ROI 1'), (2, 'ROI 2')]
    db.select_one.return_value = ('s3://upload/x/the-uuid',)
    manager = MeanSpectrumManager(
        db=db,
        s3_client=MagicMock(),
        image_storage=MagicMock(),
        sm_config={'imzml_browser_storage': {'bucket': 'browser'}},
    )
    manager.peak_count = lambda ds_id: total_peaks
    manager._browser_arrays = lambda ds_id: SimpleNamespace(
        peak_count=lambda: total_peaks, iter_chunks=lambda chunk_bytes: iter([])
    )
    manager.region_mask = lambda ds_id, roi_id, acquired_image=None, geojson=None: masks[roi_id]
    manager._acquired_image = lambda ds_id: np.array([[True, True]])
    manager._dataset_files = lambda ds_id: SimpleNamespace(
        uuid='the-uuid', upload_bucket='upload', ibd_key='the-uuid/f.ibd', reader=READER
    )
    manager._instrument = lambda ds_id: 'TOF'
    manager._cache_key = lambda *a: f'test:{a}'
    manager._roi_geojson = lambda ds_id, roi_id: {}
    monkeypatch.setattr(mean_spectrum_manager, 'get_ppm', lambda db, ds_id: 3)
    mean_spectrum_manager._cache.clear()
    return manager


MASKS = {
    None: np.array([True, True]),
    1: np.array([True, False]),
    2: np.array([True, True]),
    3: np.array([False, False]),
}


def test_availability_reports_each_region_against_the_region_cap(monkeypatch):
    manager = _manager(monkeypatch, MASKS)

    result = manager.availability(DS)

    assert result['available'] is True
    assert result['total_peaks'] == 50_000_000
    assert result['whole_dataset_available'] is False
    assert result['whole']['available'] is False and result['whole']['peaks'] == 50_000_000
    regions = {r['roi_id']: r for r in result['regions']}
    assert regions[1] == {'roi_id': 1, 'peaks': 3, 'available': True, 'reason': None}
    assert regions[2]['available'] is False and regions[2]['peaks'] == 7
    assert '7' in regions[2]['reason'] and '5' in regions[2]['reason']


def test_availability_without_browser_files(monkeypatch):
    manager = _manager(monkeypatch, MASKS)

    def boom(ds_id):
        raise RuntimeError('no such key')

    manager.peak_count = boom

    result = manager.availability(DS)

    assert result['available'] is False
    assert result['regions'] == []
    assert 'not available' in result['reason']


def test_compute_roi_with_no_acquired_pixels_raises(monkeypatch):
    manager = _manager(monkeypatch, MASKS)
    with pytest.raises(ValueError, match='no acquired pixels'):
        manager.compute(DS, 3)


def test_compute_roi_over_region_cap_names_the_region_count(monkeypatch):
    manager = _manager(monkeypatch, MASKS)
    with pytest.raises(ValueError, match='Region has 7 peaks'):
        manager.compute(DS, 2)


def test_compute_roi_reads_only_the_region_spectra(monkeypatch):
    manager = _manager(monkeypatch, MASKS)
    calls = []

    def fake_read(s3, bucket, key, reader, spectra, **kwargs):  # pylint: disable=unused-argument
        calls.append((bucket, key, list(spectra)))
        return (
            np.array([100.0, 100.0000001, 200.0]),
            np.array([1.0, 2.0, 3.0], dtype='f'),
            np.array([0, 0, 0], dtype=np.int32),
        )

    monkeypatch.setattr(mean_spectrum_manager, 'read_pixel_spectra', fake_read)
    monkeypatch.setattr(
        mean_spectrum_manager,
        'build_reference_axis_strict',
        lambda *a: (np.array([100.0]), np.array([3.0]), np.array([1])),
    )

    result = manager.compute(DS, 1)

    assert calls == [('upload', 'the-uuid/f.ibd', [0])]
    assert result['n_pixels'] == 1
    assert result['returned_peaks'] == 1


def test_compute_whole_dataset_streams_and_keeps_acquired_pixels_only(monkeypatch):
    manager = _manager(monkeypatch, {None: np.array([True, False, True])}, total_peaks=6)
    chunks = [
        (np.array([1.0, 2.0], 'f'), np.array([1.0, 1.0], 'f'), np.array([0.0, 1.0], 'f')),
        (np.array([3.0, 4.0], 'f'), np.array([1.0, 1.0], 'f'), np.array([2.0, 7.0], 'f')),
    ]
    manager._browser_arrays = lambda ds_id: SimpleNamespace(
        peak_count=lambda: 6, iter_chunks=lambda chunk_bytes: iter(chunks)
    )
    seen = {}

    def fake_build(mzs, ints, pix, instrument, ppm, n_pixels):  # pylint: disable=unused-argument
        seen['pix'] = pix.tolist()
        return np.array([1.0]), np.array([1.0]), np.array([1])

    monkeypatch.setattr(mean_spectrum_manager, 'build_reference_axis_strict', fake_build)

    result = manager.compute(DS, None)

    assert seen['pix'] == [0, 2]  # pixel 1 not acquired, pixel 7 outside the grid
    assert result['n_pixels'] == 2


def test_compute_whole_dataset_over_cap_raises(monkeypatch):
    manager = _manager(monkeypatch, MASKS, total_peaks=50_000_000)
    with pytest.raises(ValueError, match='whole dataset'):
        manager.compute(DS, None)


# ---------------------------------------------------------------------------
# MeanSpectrumManager: files-cache invalidation, one TIC fetch per availability
# ---------------------------------------------------------------------------


def test_dataset_files_cache_refreshes_when_input_path_changes(monkeypatch):
    db = MagicMock()
    db.select_one.side_effect = [('s3://upload/x/uuid-a',), ('s3://upload/x/uuid-b',)]
    s3 = MagicMock()
    s3.list_objects_v2.side_effect = lambda Bucket, Prefix: {
        'Contents': [{'Key': f'{Prefix}/file.ibd'}]
    }
    s3.get_object.side_effect = lambda Bucket, Key: {'Body': BytesIO(Key.encode())}
    monkeypatch.setattr(mean_spectrum_manager, 'deserialize', lambda body: body.decode())
    mean_spectrum_manager._files_cache.clear()
    manager = MeanSpectrumManager(
        db=db,
        s3_client=s3,
        image_storage=MagicMock(),
        sm_config={'imzml_browser_storage': {'bucket': 'browser'}},
    )

    first = manager._dataset_files(DS)
    second = manager._dataset_files(DS)
    third = MeanSpectrumManager(  # a later request: new instance, same module cache
        db=db,
        s3_client=s3,
        image_storage=MagicMock(),
        sm_config={'imzml_browser_storage': {'bucket': 'browser'}},
    )._dataset_files(DS)

    assert first is second and first.uuid == 'uuid-a'
    assert third is not first and third.uuid == 'uuid-b'
    assert third.ibd_key == 'uuid-b/file.ibd'
    assert third.reader == 'uuid-b/portable_spectrum_reader.pickle'


def test_availability_loads_the_tic_image_once_for_all_regions(monkeypatch):
    manager = _manager(monkeypatch, MASKS)
    # real implementations, not the helper's stubs
    manager.region_mask = MethodType(MeanSpectrumManager.region_mask, manager)
    manager._acquired_image = MethodType(MeanSpectrumManager._acquired_image, manager)
    manager._roi_geojson = lambda ds_id, roi_id: {}
    tic_calls = []

    def fake_tic(db, image_storage, ds_id):  # pylint: disable=unused-argument
        tic_calls.append(ds_id)
        return np.array([[1.0, 1.0]])

    monkeypatch.setattr(mean_spectrum_manager, 'get_tic_image', fake_tic)
    monkeypatch.setattr(
        mean_spectrum_manager, 'rasterise_roi_mask', lambda *a: np.array([[1, 0]], np.uint8)
    )

    result = manager.availability(DS)

    assert len(result['regions']) == 2
    assert all(r['peaks'] == 3 for r in result['regions'])
    assert tic_calls == [DS]


# ---------------------------------------------------------------------------
# duplicate-pixel check without a per-cluster sort
# ---------------------------------------------------------------------------


def test_previous_same_pixel_marks_earlier_occurrences():
    pix = np.array([5, 3, 5, 5, 3, 9])
    prev = mean_spectrum_manager._previous_same_pixel(pix)
    np.testing.assert_array_equal(prev, [-1, -1, 0, 2, 1, -1])


@pytest.mark.parametrize('seed', range(5))
def test_range_max_of_previous_matches_unique_check(seed):
    rng = np.random.default_rng(seed)
    pix = rng.integers(0, 6, 60)
    prev = mean_spectrum_manager._previous_same_pixel(pix)
    for start in range(0, 60, 7):
        for end in range(start + 1, 61, 5):
            expected = len(np.unique(pix[start:end])) == end - start
            assert (prev[start:end].max() < start) == expected
