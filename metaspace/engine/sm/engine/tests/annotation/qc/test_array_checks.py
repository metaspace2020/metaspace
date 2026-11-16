import numpy as np
import pytest

from sm.engine.annotation.qc import array_checks as ac
from sm.engine.annotation.qc import sample_checks as sc
from sm.engine.annotation.qc.config import DEFAULT_CHECKS
from sm.engine.annotation.qc.report import CheckResult, Evidence

OFFSETS = ac.NEIGHBOUR_OFFSETS


def dense_morans_i(image, mask):
    height, width = image.shape
    n_pixels = mask.sum()
    centred = np.where(mask, image - image[mask].mean(), 0.0)
    padded_d = np.pad(centred, 1)
    padded_m = np.pad(mask, 1)
    numerator = n_pairs = 0.0
    for d_row, d_col in OFFSETS:
        rows, cols = slice(1 + d_row, 1 + d_row + height), slice(1 + d_col, 1 + d_col + width)
        numerator += (centred * padded_d[rows, cols]).sum()
        n_pairs += (mask & padded_m[rows, cols]).sum()
    return n_pixels / n_pairs * numerator / (centred ** 2).sum()


def sparse_input(image, mask):
    flat = np.flatnonzero((image != 0) & mask)
    return flat, image.ravel()[flat]


def ion_arrays(images, mz_step=10.0):
    mzs, ints, pixels = [], [], []
    for k, image in enumerate(images):
        flat = np.flatnonzero(image.ravel())
        mzs.append(np.full(len(flat), 100 + mz_step * k))
        ints.append(image.ravel()[flat])
        pixels.append(flat)
    return np.concatenate(mzs), np.concatenate(ints), np.concatenate(pixels).astype(np.uint32)


def test_array_validity_counts_invalid_values():
    mzs = np.array([100.0, 200.0, 300.0])
    ints = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    assert not ac.check_array_validity(mzs, ints).would_block

    bad_mzs = np.array([100.0, np.nan, -1.0, 0.0])
    bad_ints = np.array([1.0, np.inf, 1.0, 1.0], dtype=np.float32)
    result = ac.check_array_validity(bad_mzs, bad_ints)

    assert result.would_block
    assert result.details['non_finite_mz'] == 1
    assert result.details['non_positive_mz'] == 2
    assert result.details['infinite_intensity'] == 1


def test_zero_fraction_is_exact_and_ignored_for_profile_files():
    cfg = DEFAULT_CHECKS['zero_fraction']
    declared = np.full(10, 10)

    assert ac.check_zero_fraction(np.full(10, 10), declared, 'centroid', cfg).value == 0
    mild = ac.check_zero_fraction(np.full(10, 9), declared, 'centroid', cfg)
    assert mild.value == pytest.approx(0.1) and mild.details['warn'] and not mild.would_block
    heavy = np.full(10, 7)
    assert ac.check_zero_fraction(heavy, declared, 'centroid', cfg).would_block
    assert not ac.check_zero_fraction(heavy, declared, 'profile', cfg).would_block
    assert ac.check_zero_fraction(heavy, [0], None, cfg).evidence == Evidence.NOT_ASSESSABLE


def test_peak_count_blocks_on_very_low_median():
    cfg = DEFAULT_CHECKS['peak_count']

    assert not ac.check_peak_count(np.full(100, 500), cfg).would_block
    sparse = np.full(100, 5)
    sparse[:3] = 0
    result = ac.check_peak_count(sparse, cfg)
    assert result.would_block and result.details['n_empty'] == 3


def test_spectrum_tic_handles_empty_spectra_anywhere():
    sp_lens = np.array([0, 3, 0, 0, 2, 4, 0])
    ints = np.arange(1, 10, dtype=np.float32)

    tic = ac.spectrum_tic(ints, sp_lens)

    assert np.array_equal(tic, [0, 6, 0, 0, 9, 30, 0])
    assert np.array_equal(ac.spectrum_tic(ints[:0], np.zeros(3, dtype=int)), np.zeros(3))


def test_tic_flags_injected_hot_pixels_and_excludes_off_sample_pixels():
    rng = np.random.RandomState(0)
    tic = rng.lognormal(10, 0.3, 2000)
    cfg = DEFAULT_CHECKS['tic']
    clean = ac.check_tic(tic, cfg)

    hot = tic.copy()
    hot[:100] = hot[:100] * 50
    faulty = ac.check_tic(hot, cfg)
    with_background = ac.check_tic(np.concatenate([tic, np.full(500, 1e-3)]), cfg)

    assert clean.details['hot_fraction'] < 0.01
    assert faulty.details['hot_fraction'] == pytest.approx(0.05, abs=0.01)
    assert with_background.details['n_tissue'] == 2000
    assert ac.check_tic(np.array([1.0, 2.0]), cfg).evidence == Evidence.NOT_ASSESSABLE


def test_low_occupancy_rises_with_injected_scattered_noise_peaks():
    rng = np.random.RandomState(0)
    n_pixels = 400
    ions = 100 + 10 * np.repeat(np.arange(20), n_pixels)
    ion_mzs = ions + rng.uniform(0, 1e-5, len(ions))
    noise_mzs = rng.uniform(100, 300, len(ion_mzs))
    cfg = DEFAULT_CHECKS['low_occupancy']

    def occupancy(mzs):
        return ac.check_low_occupancy(ac.build_bins(np.sort(mzs), 3.0, cfg['max_bins']), cfg)

    clean, noisy = occupancy(ion_mzs), occupancy(np.concatenate([ion_mzs, noise_mzs]))

    assert clean.value < 0.01
    assert noisy.value == pytest.approx(0.5, abs=0.05)
    assert noisy.evidence == Evidence.INFERRED
    assert ac.check_low_occupancy(None, cfg).evidence == Evidence.NOT_ASSESSABLE


def test_build_bins_bounds_index_the_peaks_of_each_bin():
    mzs = np.sort(np.concatenate([np.full(5, 100.0), np.full(3, 200.0), np.full(2, 300.0)]))

    bins = ac.build_bins(mzs, 3.0, 5_000_000)
    counts = np.diff(bins.bounds)

    assert counts.sum() == 10
    assert sorted(counts[counts > 0].tolist()) == [2, 3, 5]
    assert ac.build_bins(np.full(5, 100.0), 3.0, 100) is None


@pytest.mark.parametrize('kind', ['random', 'smooth'])
def test_morans_i_matches_dense_reference_on_a_mask_with_holes(kind):
    rng = np.random.RandomState(3)
    mask = rng.rand(25, 30) > 0.25
    if kind == 'random':
        image = rng.rand(25, 30) * (rng.rand(25, 30) > 0.5)
    else:
        image = np.add.outer(np.arange(25.0), np.arange(30.0)) * (rng.rand(25, 30) > 0.3)
    image = image * mask

    result = ac.morans_i(*sparse_input(image, mask), ac.build_neighbourhood(mask))

    assert result == pytest.approx(dense_morans_i(image, mask), abs=1e-9)


def test_spatial_coherence_separates_structured_from_scattered_ions():
    rng = np.random.RandomState(0)
    mask = np.ones((30, 30), dtype=bool)
    structured, scattered = [], []
    for _ in range(10):
        row = rng.randint(5, 25)
        image = np.zeros((30, 30))
        image[:row] = rng.uniform(1, 2, (row, 30))
        structured.append(image)
        scattered.append(rng.uniform(1, 2, (30, 30)) * (rng.rand(30, 30) > 0.5))
    cfg = dict(DEFAULT_CHECKS['spatial_coherence'], n_bins=10)

    def coherence(images):
        mzs, ints, pixels = ion_arrays(images)
        bins = ac.build_bins(mzs, 3.0, 5_000_000)
        return ac.check_spatial_coherence({'sp_idxs': pixels, 'ints': ints}, bins, mask, cfg)

    assert coherence(structured).value == 0.0
    assert coherence(scattered).value >= 0.9
    assert coherence(structured).details['n_assessed'] == 10


def test_spatial_coherence_not_assessable_for_oversized_grid():
    mask = np.ones((10, 10), dtype=bool)
    cfg = dict(DEFAULT_CHECKS['spatial_coherence'], max_dense_cells=50)
    bins = ac.build_bins(np.array([100.0, 200.0, 300.0]), 3.0, 5_000_000)

    result = ac.check_spatial_coherence(
        {'sp_idxs': np.zeros(3), 'ints': np.ones(3)}, bins, mask, cfg
    )

    assert result.evidence == Evidence.NOT_ASSESSABLE


def test_noise_combined_adds_incoherent_share_of_the_remaining_peaks():
    cfg = DEFAULT_CHECKS['noise_combined']
    low = CheckResult(name='low_occupancy', tier='C2', value=0.5)
    coherence = CheckResult(name='spatial_coherence', tier='C2', value=0.4)

    assert ac.check_noise_combined(low, coherence, cfg).value == pytest.approx(0.7)
    no_coherence = CheckResult(name='spatial_coherence', tier='C2')
    assert ac.check_noise_combined(low, no_coherence, cfg).value == pytest.approx(0.5)
    missing = CheckResult(name='low_occupancy', tier='C2')
    assert ac.check_noise_combined(missing, coherence, cfg).evidence == Evidence.NOT_ASSESSABLE


def test_sample_values_counts_invalid_raw_values_but_not_zeros():
    clean = [(np.array([100.0, 200.0]), np.array([0.0, 5.0]))]
    faulty = [(np.array([100.0, np.nan]), np.array([-1.0, np.nan]))]

    ok = sc.check_sample_values(clean)
    bad = sc.check_sample_values(faulty)

    assert ok.value == 0 and ok.details['zero_intensity'] == 1 and not ok.would_block
    assert bad.would_block
    assert bad.details['negative_intensity'] == 1 and bad.details['nan_intensity'] == 1
