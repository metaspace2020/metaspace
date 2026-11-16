import numpy as np

from sm.engine.annotation.qc.layout import analyze_layout


def block_coords(x0, y0, w, h):
    xs, ys = np.meshgrid(np.arange(x0, x0 + w), np.arange(y0, y0 + h))
    return xs.ravel(), ys.ravel()


def join(*blocks):
    return np.concatenate([b[0] for b in blocks]), np.concatenate([b[1] for b in blocks])


def test_compact_block_is_one_full_component():
    result = analyze_layout(*block_coords(1, 1, 10, 8))

    assert result['n_components'] == 1
    assert result['fill_fraction'] == 1.0
    assert result['n_duplicates'] == 0
    assert result['largest_component_share'] == 1.0
    assert np.isclose(result['compactness'][0], 1.0)


def test_distant_blobs_stay_separate_and_one_pixel_gap_merges_on_dilation():
    far = analyze_layout(*join(block_coords(1, 1, 5, 5), block_coords(30, 30, 5, 5)))
    near = analyze_layout(*join(block_coords(1, 1, 5, 5), block_coords(7, 1, 5, 5)))

    assert far['n_components'] == 2
    assert far['n_components_after_dilation'] == 2
    assert far['gaps_to_largest'][0] > 10
    assert near['n_components'] == 2
    assert near['n_components_after_dilation'] == 1


def test_duplicate_and_invalid_coordinates_are_counted():
    x = np.array([1, 2, 2, 0, 3])
    y = np.array([1, 1, 1, 1, -1])

    result = analyze_layout(x, y)

    assert result['n_invalid'] == 2
    assert result['n_duplicates'] == 1
    assert result['n_unique'] == 2


def test_oversized_bounding_box_skips_mask_analysis():
    result = analyze_layout(np.array([1, 5000]), np.array([1, 5000]), max_dense_cells=1000)

    assert result['analysed'] is False
    assert result['dense_size'] == 25_000_000
    assert 'n_components' not in result
