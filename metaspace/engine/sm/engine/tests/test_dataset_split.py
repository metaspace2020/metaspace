"""Unit tests for ROI-based dataset splitting."""

from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.dataset_split import (
    CoalescingRangeReader,
    DatasetSplitError,
    crop_optical_image,
    local_range_fetcher,
    parse_input_path,
    plan_child,
    read_parent_format,
    rebase_coordinates,
    spectrum_ranges,
    write_child_imzml,
)

# The parent's scan coordinates deliberately do NOT start at (1, 1). Every test below depends on
# that offset: an implementation that rasterises ROIs against raw imzML coordinates instead of the
# re-based ion-image grid passes on a (1, 1)-based fixture and silently selects the wrong pixels
# on a real one.
RAW_ORIGIN = (12, 40)
GRID_W, GRID_H = 4, 3


def _make_parent(path: Path, mode='processed', duplicate_at=None, mz_dtype=np.float64):
    """Write a 4x3 imzML whose scan coordinates start at RAW_ORIGIN."""
    mzs = np.array([100.0, 200.0, 300.0])
    coords = []
    with ImzMLWriter(
        str(path), mode=mode, mz_dtype=mz_dtype, intensity_dtype=np.float32, polarity='positive'
    ) as writer:
        for y in range(GRID_H):
            for x in range(GRID_W):
                coord = (RAW_ORIGIN[0] + x, RAW_ORIGIN[1] + y)
                ints = np.array([1.0 + x, 2.0 + y, 3.0], dtype=np.float32)
                writer.addSpectrum(mzs, ints, coord)
                coords.append(coord)
                if duplicate_at == (x, y):
                    # Some exporters emit two spectra at the same coordinate.
                    writer.addSpectrum(mzs, ints * 10, coord)
                    coords.append(coord)
    return coords


def _roi(coords, roi_id=1):
    """A GeoJSON feature in ion-image (re-based) pixel space."""
    return {
        'type': 'Feature',
        'properties': {'id': roi_id, 'coordinates': [{'x': x, 'y': y} for x, y in coords]},
    }


def _open(path: Path):
    return ImzMLParser(str(path) + '.imzML', ibd_file=None)


def _coords_xy(parser):
    """The (x, y) array callers are now expected to compute once and pass in."""
    return np.array(parser.coordinates)[:, :2]


def _reader(path: Path):
    return CoalescingRangeReader(local_range_fetcher(Path(str(path) + '.ibd')))


def test_parse_input_path():
    assert parse_input_path('s3a://upload-bucket/abc-123') == ('upload-bucket', 'abc-123')
    assert parse_input_path('s3a://upload-bucket/abc-123/') == ('upload-bucket', 'abc-123')
    with pytest.raises(DatasetSplitError):
        parse_input_path('nonsense')


def test_rebase_coordinates_matches_imzml_reader_convention(tmp_path):
    _make_parent(tmp_path / 'parent')
    parser = _open(tmp_path / 'parent')

    xs, ys, width, height = rebase_coordinates(_coords_xy(parser))

    assert (width, height) == (GRID_W, GRID_H)
    assert xs.min() == 0 and ys.min() == 0
    # Same result as ImzMLReader.__init__ computes.
    expected = np.array(parser.coordinates)[:, :2] - np.min(
        np.array(parser.coordinates)[:, :2], axis=0
    )
    assert np.array_equal(xs, expected[:, 0])
    assert np.array_equal(ys, expected[:, 1])


def test_plan_child_selects_pixels_in_rebased_space(tmp_path):
    _make_parent(tmp_path / 'parent')
    parser = _open(tmp_path / 'parent')

    # Left half of the ion image, in ion-image coordinates.
    geojson = _roi([(0, 0), (1, 0), (1, 2), (0, 2)])
    spec = plan_child(_coords_xy(parser), geojson, roi_id=1, roi_name='left')

    xs, ys, _, _ = rebase_coordinates(_coords_xy(parser))
    assert set(xs[spec.sp_idxs]) == {0, 1}
    assert spec.crop_origin == (0, 0)
    assert (spec.width, spec.height) == (2, 3)
    assert spec.n_pixels == 6


def test_plan_child_crop_origin_is_offset_for_non_origin_roi(tmp_path):
    _make_parent(tmp_path / 'parent')
    parser = _open(tmp_path / 'parent')

    geojson = _roi([(2, 1), (3, 1), (3, 2), (2, 2)])
    spec = plan_child(_coords_xy(parser), geojson, roi_id=1, roi_name='bottom-right')

    assert spec.crop_origin == (2, 1)
    assert (spec.width, spec.height) == (2, 2)
    assert spec.n_pixels == 4


def test_plan_child_keeps_every_spectrum_at_a_selected_coordinate(tmp_path):
    _make_parent(tmp_path / 'parent', duplicate_at=(0, 0))
    parser = _open(tmp_path / 'parent')

    geojson = _roi([(0, 0), (1, 0), (1, 1), (0, 1)])
    spec = plan_child(_coords_xy(parser), geojson, roi_id=1, roi_name='corner')

    xs, ys, _, _ = rebase_coordinates(_coords_xy(parser))
    selected = list(zip(xs[spec.sp_idxs], ys[spec.sp_idxs]))
    # (0, 0) appears twice in the parent and must appear twice in the child.
    assert selected.count((0, 0)) == 2
    # ...but the pixel count, which the size floor applies to, counts it once.
    assert spec.n_pixels == len(set(selected))


def test_plan_child_rejects_roi_outside_sample_area(tmp_path):
    _make_parent(tmp_path / 'parent')
    parser = _open(tmp_path / 'parent')

    geojson = _roi([(50, 50), (60, 50), (60, 60), (50, 60)])
    with pytest.raises(DatasetSplitError, match='does not overlap any spectra'):
        plan_child(_coords_xy(parser), geojson, roi_id=1, roi_name='off-tissue')


def test_plan_child_rejects_missing_polygon(tmp_path):
    _make_parent(tmp_path / 'parent')
    parser = _open(tmp_path / 'parent')

    with pytest.raises(DatasetSplitError, match='no usable polygon'):
        plan_child(_coords_xy(parser), {'features': []}, roi_id=1, roi_name='missing')


@pytest.mark.parametrize('mode', ['processed', 'continuous'])
def test_write_child_round_trips_spectra_and_crops_coordinates(tmp_path, mode):
    _make_parent(tmp_path / 'parent', mode=mode)
    parser = _open(tmp_path / 'parent')
    fmt = read_parent_format(parser)
    assert fmt.mode == mode
    assert fmt.polarity == 'positive'

    geojson = _roi([(2, 1), (3, 1), (3, 2), (2, 2)])
    spec = plan_child(_coords_xy(parser), geojson, roi_id=1, roi_name='roi')
    files = write_child_imzml(
        parser, _coords_xy(parser), _reader(tmp_path / 'parent'), spec, fmt, tmp_path / 'child'
    )

    assert files.imzml_size > 0 and files.ibd_size > 0
    child = ImzMLParser(str(files.imzml_path), ibd_file=None)

    # Child is cropped and re-based to (1, 1).
    child_xy = [(x, y) for x, y, *_ in child.coordinates]
    assert sorted(child_xy) == [(1, 1), (1, 2), (2, 1), (2, 2)]
    assert read_parent_format(child).mode == mode

    # Intensities survive intact, and crop_origin maps child pixels back onto parent pixels.
    parent_reader = _reader(tmp_path / 'parent')
    parent_reader.plan(spectrum_ranges(parser, spec.sp_idxs))
    parent_spectra = parser.portable_spectrum_reader()
    child_reader = _reader(tmp_path / 'child')
    child_reader.plan(spectrum_ranges(child, range(len(child.coordinates))))
    child_spectra = child.portable_spectrum_reader()
    x0, y0 = spec.crop_origin
    raw_x0, raw_y0 = RAW_ORIGIN
    for child_idx, (cx, cy, *_) in enumerate(child.coordinates):
        parent_idx = next(
            i
            for i in spec.sp_idxs
            if parser.coordinates[i][0] == raw_x0 + x0 + cx - 1
            and parser.coordinates[i][1] == raw_y0 + y0 + cy - 1
        )
        _, parent_ints = parent_spectra.read_spectrum_from_file(parent_reader, parent_idx)
        _, child_ints = child_spectra.read_spectrum_from_file(child_reader, child_idx)
        assert np.array_equal(parent_ints, child_ints)


def test_write_child_preserves_mz_dtype(tmp_path):
    _make_parent(tmp_path / 'parent', mz_dtype=np.float32)
    parser = _open(tmp_path / 'parent')
    assert parser.mzPrecision == 'f'

    geojson = _roi([(0, 0), (3, 0), (3, 2), (0, 2)])
    coords_xy = _coords_xy(parser)
    spec = plan_child(coords_xy, geojson, roi_id=1, roi_name='all')
    files = write_child_imzml(
        parser,
        coords_xy,
        _reader(tmp_path / 'parent'),
        spec,
        read_parent_format(parser),
        tmp_path / 'child',
    )

    assert ImzMLParser(str(files.imzml_path), ibd_file=None).mzPrecision == 'f'


def test_read_parent_format_rejects_compressed_ibd(tmp_path):
    from pyimzml.compression import ZlibCompression

    path = tmp_path / 'compressed'
    with ImzMLWriter(str(path), mz_compression=ZlibCompression()) as writer:
        writer.addSpectrum(np.array([100.0]), np.array([1.0]), (1, 1))

    with pytest.raises(DatasetSplitError, match='compressed binary data'):
        read_parent_format(ImzMLParser(str(path) + '.imzML', ibd_file=None))


def test_coalescing_reader_merges_nearby_ranges_and_reads_identical_bytes(tmp_path):
    path = tmp_path / 'blob.bin'
    payload = bytes(range(256)) * 400  # 102400 bytes
    path.write_bytes(payload)

    calls = []

    def counting_fetch(offset, length):
        calls.append((offset, length))
        return payload[offset : offset + length]

    ranges = [(i * 100, 8) for i in range(50)]
    reader = CoalescingRangeReader(counting_fetch, max_gap=1024, max_chunk=2**20)
    reader.plan(ranges)
    for offset, length in ranges:
        reader.seek(offset)
        assert reader.read(length) == payload[offset : offset + length]

    # 50 scattered small reads spanning <5 KB collapse into a single request.
    assert len(calls) == 1


def test_coalescing_reader_splits_when_gap_exceeds_threshold(tmp_path):
    payload = bytes(1024 * 64)

    calls = []

    def counting_fetch(offset, length):
        calls.append((offset, length))
        return payload[offset : offset + length]

    reader = CoalescingRangeReader(counting_fetch, max_gap=16, max_chunk=2**20)
    reader.plan([(0, 8), (40000, 8)])
    for offset in (0, 40000):
        reader.seek(offset)
        reader.read(8)

    assert len(calls) == 2


def test_coalescing_reader_falls_back_to_direct_read_when_unplanned():
    payload = bytes(range(256))

    def fetch(offset, length):
        return payload[offset : offset + length]

    reader = CoalescingRangeReader(fetch)
    reader.seek(10)
    assert reader.read(4) == payload[10:14]


def test_crop_optical_image_keeps_child_corners_on_the_same_optical_pixels():
    raw = Image.new('RGB', (400, 300), 'white')
    # Parent ion space is 40x30; optical image is 10x larger and offset by (5, 7).
    transform = [[10.0, 0.0, 5.0], [0.0, 10.0, 7.0], [0.0, 0.0, 1.0]]
    crop_origin = (10, 5)
    child_w, child_h = 12, 8

    cropped, child_transform = crop_optical_image(raw, transform, child_w, child_h, crop_origin)

    parent_matrix = np.array(transform)
    child_matrix = np.array(child_transform)
    # The child's ion corners must land on the same physical optical pixels as before, once the
    # crop offset is added back on.
    for cx, cy in [(0, 0), (child_w, 0), (child_w, child_h), (0, child_h)]:
        parent_point = parent_matrix @ np.array([cx + crop_origin[0], cy + crop_origin[1], 1.0])
        child_point = child_matrix @ np.array([cx, cy, 1.0])
        parent_point = parent_point[:2] / parent_point[2]
        child_point = child_point[:2] / child_point[2]
        assert np.allclose(parent_point - np.array([105.0, 57.0]), child_point)

    assert cropped.size == (120, 80)


def test_crop_optical_image_rejects_region_outside_image():
    raw = Image.new('RGB', (10, 10), 'white')
    transform = [[1.0, 0.0, 500.0], [0.0, 1.0, 500.0], [0.0, 0.0, 1.0]]
    with pytest.raises(DatasetSplitError, match='outside the optical image'):
        crop_optical_image(raw, transform, 5, 5, (0, 0))


def test_crop_optical_image_rejects_bad_transform_shape():
    raw = Image.new('RGB', (10, 10), 'white')
    with pytest.raises(DatasetSplitError, match='3x3'):
        crop_optical_image(raw, [[1.0, 0.0], [0.0, 1.0]], 5, 5, (0, 0))
