import pytest
from itertools import product
from pyMSpec.pyisocalc import pyisocalc
from pyMSpec.pyisocalc.periodic_table import periodic_table

import sm.engine.isotope_labels  # noqa: F401 — ensure periodic table is patched before tests

from sm.engine.formula_parser import (
    generate_ion_formula,
    safe_generate_ion_formula,
    ParseFormulaError,
    format_ion_formula,
    calculate_mono_mz,
)


@pytest.mark.parametrize(
    'formula, adduct',
    product(
        ['C2H6O', 'C7H6O4', 'C40H78NO8P', 'C16H18O9S', 'C46H80NO8P', 'C50H100NO8P'],
        ['+H', '+Na', '+K', '-H', '+Cl'],
    ),
)
def test_compare_generate_simple_ion_formula_with_pymspec(formula, adduct):
    ion_formula = generate_ion_formula(formula, adduct)

    assert ion_formula == str(pyisocalc.parseSumFormula(formula + adduct))


@pytest.mark.parametrize(
    'formula, comma_separated_adducts',
    product(
        ['C2H6O', 'C7H6O4', 'C40H78NO8P', 'C16H18O9S', 'C46H80NO8P', 'C50H100NO8P'],
        [',,', '+H,+Na', ',-H2O', '-H2O+CO2', '+H,+H2,+H3,-H4', '-H6+H6', '-H6,+H6'],
    ),
)
def test_compare_generate_complex_ion_formula_with_pymspec(formula, comma_separated_adducts):
    adducts = comma_separated_adducts.split(',')
    ion_formula = safe_generate_ion_formula(formula, *adducts)

    assert ion_formula == str(pyisocalc.parseSumFormula(formula + ''.join(adducts)))


@pytest.mark.parametrize(
    'formula, comma_separated_adducts', product(['C2H6O'], ['-H10+H10', '-H10,+H10'])
)
def test_generate_ion_formula_negative_values(formula, comma_separated_adducts):
    adducts = comma_separated_adducts.split(',')
    try:
        generate_ion_formula(formula, *adducts)
        assert False, 'Should have raised ParseFormulaError'
    except ParseFormulaError:
        pass


@pytest.mark.parametrize(
    'formula, adduct', product(['C2H6O', 'C7H6O4', 'C40H78NO8P'], ['[M]-', '[M]+'])
)
def test_generate_ion_formula_with_charge_only_adduct(formula, adduct):
    ion_formula = safe_generate_ion_formula(formula, adduct)

    assert ion_formula == formula


def test_generate_ion_formula_with_labeled_element():
    # X = pure 13C; X6H12O6 is fully 13C-labelled glucose.
    # After +H adduct the ion formula should contain X6, H13, O6 (in CHNOPS order).
    ion_formula = generate_ion_formula('X6H12O6', '+H')
    assert ion_formula == 'H13O6X6'


def test_generate_ion_formula_labeled_rejects_negative():
    # Removing more X than are present should raise ParseFormulaError.
    with pytest.raises(ParseFormulaError):
        generate_ion_formula('X2H6O', '-X3')


def test_calculate_mono_mz_labeled_element():
    # [U-13C6]-glucose ion formula after +H adduct.
    # Monoisotopic m/z = 6*M(13C) + 13*M(H) + 6*M(O) - M(electron)
    M_13C = periodic_table['X'][2][0]   # 13.00335484
    M_H = periodic_table['H'][2][0]     # 1.007825032
    M_O = periodic_table['O'][2][0]     # 15.994914620
    M_e = periodic_table['Ee'][2][0]    # 0.000548580

    expected_mz = 6 * M_13C + 13 * M_H + 6 * M_O - M_e
    assert calculate_mono_mz('H13O6X6', '+') == pytest.approx(expected_mz, rel=1e-6)


def test_format_ion_formula():
    assert format_ion_formula('M') == 'M'
    assert format_ion_formula('M', charge=1) == 'M+'
    assert format_ion_formula('M', '+H', charge=1) == 'M+H+'
    assert format_ion_formula('M', '-H2O', '+H', charge=1) == 'M-H2O+H+'
    assert format_ion_formula('M', '[M]+', charge=1) == 'M+'
    assert format_ion_formula('M', '-H2O', '[M]-', charge=-1) == 'M-H2O-'
    assert format_ion_formula('M', charge=-10) == 'M-10'
    assert format_ion_formula('M', charge=10) == 'M+10'
