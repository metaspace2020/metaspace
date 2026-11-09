from functools import partial

import pytest

from sm.engine.formula_parser import ParseFormulaError, generate_ion_formula
from tests.consistency.refs import check_ref
from tests.consistency.synth import make_formulas
from tests.consistency.tolerances import assert_tree

pytestmark = pytest.mark.consistency

ADDUCTS = ['+H', '+Na', '-H', '+Cl', '[M]+']
CHEM_MODS = ['', '-H2O']


def test_generate_ion_formula_matches_reference():
    actual = {}
    for formula in make_formulas(30):
        for chem_mod in CHEM_MODS:
            for adduct in ADDUCTS:
                try:
                    ion = generate_ion_formula(formula, chem_mod, adduct)
                except ParseFormulaError:
                    ion = 'ERROR'
                actual[f'{formula}|{chem_mod}|{adduct}'] = ion
    assert 'ERROR' in actual.values()
    assert any(v != 'ERROR' for v in actual.values())
    check_ref('formula/ion_grid', actual, partial(assert_tree, tol=None))
