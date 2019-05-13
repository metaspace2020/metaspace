import pytest
from itertools import product
from pyMSpec.pyisocalc import pyisocalc

from sm.engine.formula_parser import generate_ion_formula


@pytest.mark.parametrize('formula, adduct', product(
    ['C2H6O', 'C7H6O4', 'C40H78NO8P', 'C16H18O9S', 'C46H80NO8P', 'C50H100NO8P'],
    ['+H', '+Na', '+K', '-H', '+Cl'],
))
def test_compare_generate_simple_ion_formula_with_pymspec(formula, adduct):
    ion_formula = generate_ion_formula(formula, adduct)

    assert ion_formula == str(pyisocalc.parseSumFormula(formula + adduct))
