"""Tests for the isotopic_pattern REST helper, including labeled-element support."""
import pytest
import sm.engine.isotope_labels  # noqa: F401 — patches pyMSpec periodic_table

from sm.rest.isotopic_pattern import generate

M_13C = 13.00335484
M_12C = 12.0

# Shared instrument args used in every call
_INSTR = 'tof'
_RP = '1000'
_AT_MZ = '200'
_CHARGE = '+1'


class TestGenerateUnlabeled:
    def test_returns_dict_with_expected_keys(self):
        result = generate('H2O', _INSTR, _RP, _AT_MZ, _CHARGE)
        assert 'theor' in result
        assert 'mz_grid' in result
        theor = result['theor']
        assert 'centroid_mzs' in theor
        assert 'mzs' in theor
        assert 'ints' in theor

    def test_natural_glucose_centroid_near_expected_mz(self):
        # [U-12C6]-glucose + H: C6H13O6, monoisotopic ~181.07 Da
        result = generate('C6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)
        mz0 = result['theor']['centroid_mzs'][0]
        assert abs(mz0 - 181.07) < 0.05, f'Unexpected M centroid: {mz0}'

    def test_unlabeled_produces_multiple_peaks(self):
        result = generate('C6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)
        assert len(result['theor']['centroid_mzs']) > 1, 'Expected M+1, M+2, … peaks for natural glucose'


class TestGenerateLabeled:
    def test_labeled_glucose_shift_equals_six_delta_masses(self):
        """[U-¹³C6]-glucose + H = X6H13O6 must be exactly 6 × (¹³C − ¹²C) heavier than C6H13O6."""
        natural = generate('C6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)
        labeled = generate('X6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)

        natural_mz0 = natural['theor']['centroid_mzs'][0]
        labeled_mz0 = labeled['theor']['centroid_mzs'][0]

        expected_shift = 6 * (M_13C - M_12C)
        # cpyMSpec returns peak centroids (intensity-weighted), not exact monoisotopic masses.
        # The M peak centroid is offset slightly by the M+1 tail, and this offset differs
        # between the natural compound (C contributes ~7 % M+1) and the labeled compound
        # (no C → much smaller M+1).  Allow 1 mDa of centroid-induced bias.
        assert abs((labeled_mz0 - natural_mz0) - expected_shift) < 1e-3, (
            f'Expected shift {expected_shift:.5f}, got {labeled_mz0 - natural_mz0:.5f}'
        )

    def test_labeled_produces_multiple_peaks(self):
        """M+1, M+2 from unlabeled H/O atoms must still appear."""
        result = generate('X6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)
        assert len(result['theor']['centroid_mzs']) > 1, 'Expected isotope peaks from H/O natural isotopes'

    def test_profile_mzs_consistent_with_centroid_mzs(self):
        """Profile envelope must cover the same m/z range as the shifted centroids."""
        result = generate('X6H13O6', _INSTR, _RP, _AT_MZ, _CHARGE)
        mz_min = result['mz_grid']['min_mz']
        mz_max = result['mz_grid']['max_mz']
        for mz in result['theor']['centroid_mzs']:
            assert mz_min < mz < mz_max, f'Centroid {mz} outside mz_grid [{mz_min}, {mz_max}]'

    def test_partial_label_shift(self):
        """Partially labeled compound X2H4 should shift by 2 × (¹³C − ¹²C) vs C2H4."""
        natural = generate('C2H4', _INSTR, _RP, _AT_MZ, _CHARGE)
        labeled = generate('X2H4', _INSTR, _RP, _AT_MZ, _CHARGE)
        natural_mz0 = natural['theor']['centroid_mzs'][0]
        labeled_mz0 = labeled['theor']['centroid_mzs'][0]
        expected_shift = 2 * (M_13C - M_12C)
        assert abs((labeled_mz0 - natural_mz0) - expected_shift) < 5e-4

    def test_all_labeled_raises(self):
        """A formula consisting entirely of X atoms has no natural isotope pattern."""
        with pytest.raises(ValueError, match='entirely of labeled elements'):
            generate('X6', _INSTR, _RP, _AT_MZ, _CHARGE)
