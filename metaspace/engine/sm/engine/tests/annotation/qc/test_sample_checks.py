import numpy as np
import pytest

from sm.engine.annotation.qc import sample_checks as sc
from sm.engine.annotation.qc.config import DEFAULT_CHECKS
from sm.engine.annotation.qc.report import Evidence
from sm.engine.annotation.qc.sampling import read_raw_spectra, sample_spectrum_indices

FORM = {'analyzer': 'TOF', 'resolving_power': 10000, 'resolving_power_mz': 200}
WIDTH_PPM = 1e6 / FORM['resolving_power']
N_SPECTRA = 30


def centroid_spectrum(rng, n_peaks=200):
    mzs = np.sort(rng.uniform(100, 110, n_peaks))
    return mzs, rng.lognormal(0, 1, n_peaks)


def profile_spectrum(rng, n_points=4000):
    step_ppm = WIDTH_PPM / 4
    mzs = 100 * (1 + step_ppm * 1e-6) ** np.arange(n_points)
    ints = np.zeros(n_points)
    sigma_steps = 4 / 2.355
    index = np.arange(n_points)
    for center in range(100, n_points, 200):
        ints += rng.uniform(1, 5) * np.exp(-0.5 * ((index - center) / sigma_steps) ** 2)
    return mzs, ints


def add_shoulders(spectrum):
    mzs, ints = spectrum
    offset = 0.2 * WIDTH_PPM * 1e-6 * mzs
    return (
        np.concatenate([mzs, mzs - offset, mzs + offset]),
        np.concatenate([ints, ints * 0.5, ints * 0.5]),
    )


def many(make):
    rng = np.random.RandomState(1)
    return [make(rng) for _ in range(N_SPECTRA)]


def likeness(spectra, form=FORM):
    return sc.check_profile_likeness(spectra, form, DEFAULT_CHECKS['profile_likeness'])


def test_profile_likeness_separates_centroid_from_profile_and_reacts_to_shoulders():
    centroid = many(centroid_spectrum)
    profile = many(profile_spectrum)
    shouldered = [add_shoulders(s) for s in centroid]

    clean_score = likeness(centroid).value
    profile_score = likeness(profile).value
    shoulder_score = likeness(shouldered).value

    assert clean_score < 0.2
    assert profile_score > 0.8
    assert shoulder_score > clean_score + 0.2
    assert likeness(centroid).evidence == Evidence.INFERRED
    assert not likeness(profile).would_block


def test_profile_likeness_without_form_falls_back_to_self_reference():
    result = likeness(many(profile_spectrum), form={})

    assert result.details['proxy_a_form'] is None
    assert result.details['proxy_a_self'] > 0.5
    assert result.value > 0.7
    assert likeness([]).evidence == Evidence.NOT_ASSESSABLE


def test_profile_likeness_would_block_only_with_a_threshold():
    cfg = dict(DEFAULT_CHECKS['profile_likeness'], fail_above=0.5)

    assert sc.check_profile_likeness(many(profile_spectrum), FORM, cfg).would_block
    assert not sc.check_profile_likeness(many(centroid_spectrum), FORM, cfg).would_block


def test_mz_order_flags_unsorted_and_duplicate_mz():
    cfg = DEFAULT_CHECKS['mz_order']
    clean = many(centroid_spectrum)
    unsorted = [(mzs[::-1], ints[::-1]) for mzs, ints in clean[:10]] + clean[10:]
    duplicated = [(np.repeat(mzs, 2), np.repeat(ints, 2)) for mzs, ints in clean]

    assert sc.check_mz_order(clean, cfg).value == 0
    assert sc.check_mz_order(unsorted, cfg).value == pytest.approx(10 / N_SPECTRA)
    assert sc.check_mz_order(duplicated, cfg).details['duplicate_fraction'] == 1.0


def test_saturation_detects_clipped_intensities():
    cfg = DEFAULT_CHECKS['saturation']
    clean = many(centroid_spectrum)
    clipped = [(mzs, np.minimum(ints, 1.0)) for mzs, ints in clean]

    assert sc.check_saturation(clean, cfg).value == pytest.approx(1 / N_SPECTRA)
    assert sc.check_saturation(clipped, cfg).value == 1.0


def test_intensity_transform_hints():
    clean = many(centroid_spectrum)
    normalised = [(mzs, np.round(ints / ints.max() * 100)) for mzs, ints in clean]

    assert sc.check_intensity_transform(clean).value == 0
    hints = sc.check_intensity_transform(normalised).details
    assert (
        hints['integer_valued'] and hints['round_number_max'] and hints['same_max_in_most_spectra']
    )


def test_near_floor_fraction_on_a_known_intensity_ramp():
    ramp = np.arange(1, 101, dtype=float)
    spectra = [(np.arange(100, dtype=float), ramp)]

    result = sc.check_near_floor(spectra, DEFAULT_CHECKS['near_floor'])

    assert result.value == pytest.approx(0.17)
    zeros = sc.check_near_floor([(ramp, np.zeros(100))], DEFAULT_CHECKS['near_floor'])
    assert zeros.evidence == Evidence.NOT_ASSESSABLE


def test_sampling_is_stratified_deterministic_and_spread_out():
    first = sample_spectrum_indices(10_000, 300, seed=0)
    again = sample_spectrum_indices(10_000, 300, seed=0)
    edges = np.linspace(0, 10_000, 301).astype(int)

    assert np.array_equal(first, again)
    assert len(first) == 300
    assert np.all((first >= edges[:-1]) & (first < edges[1:]))
    assert np.array_equal(sample_spectrum_indices(5, 300), np.arange(5))


def test_read_raw_spectra_unpacks_reader_output():
    class FakeReader:
        @staticmethod
        def read_raw_spectra(_storage, indices):
            return ((i, np.array([i]), np.array([2 * i])) for i in indices)

    spectra = read_raw_spectra(FakeReader(), None, [3, 5])

    assert [(mz[0], it[0]) for mz, it in spectra] == [(3, 6), (5, 10)]
