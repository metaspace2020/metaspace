import pytest
from itertools import product
from pyMSpec.pyisocalc import pyisocalc

from sm.engine.formula_parser import generate_ion_formula, safe_generate_ion_formula, ParseFormulaError


@pytest.mark.parametrize('formula, adduct', product(
    ['C2H6O', 'C7H6O4', 'C40H78NO8P', 'C16H18O9S', 'C46H80NO8P', 'C50H100NO8P'],
    ['+H', '+Na', '+K', '-H', '+Cl'],
))
def test_compare_generate_simple_ion_formula_with_pymspec(formula, adduct):
    ion_formula = generate_ion_formula(formula, adduct)

    assert ion_formula == str(pyisocalc.parseSumFormula(formula + adduct))


@pytest.mark.parametrize('formula, comma_separated_adducts', product(
    ['C2H6O', 'C7H6O4', 'C40H78NO8P', 'C16H18O9S', 'C46H80NO8P', 'C50H100NO8P'],
    [',,', '+H,+Na', ',-H2O', '-H2O+CO2', '+H,+H2,+H3,-H4', '-H6+H6', '-H6,+H6'],
))
def test_compare_generate_complex_ion_formula_with_pymspec(formula, comma_separated_adducts):
    adducts = comma_separated_adducts.split(',')
    ion_formula = safe_generate_ion_formula(formula, *adducts)

    assert ion_formula == str(pyisocalc.parseSumFormula(formula + ''.join(adducts)))


@pytest.mark.parametrize('formula, comma_separated_adducts', product(
    ['C2H6O'],
    ['-H10+H10', '-H10,+H10'],
))
def test_generate_ion_formula_negative_values(formula, comma_separated_adducts):
    adducts = comma_separated_adducts.split(',')
    try:
        generate_ion_formula(formula, *adducts)
        assert False, 'Should have raised ParseFormulaError'
    except ParseFormulaError:
        pass
