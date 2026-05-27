"""Unit tests for sm.engine.isotope_labels."""

import pytest
from pyMSpec.pyisocalc.periodic_table import periodic_table
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

import sm.engine.isotope_labels  # noqa: F401 — patches periodic table
from sm.engine.isotope_labels import extract_labeled_mass_shift, has_labeled_elements

# Exact masses used in assertions (must match ISOTOPE_LABEL_ELEMENTS)
M_CX = 13.00335484  # ¹³C
M_NX = 15.00010889  # ¹⁵N
M_HX = 2.014101778  # ²H
M_OX = 17.99915961  # ¹⁸O
M_SX = 33.96786700  # ³⁴S


# ---------------------------------------------------------------------------
# Periodic table registration
# ---------------------------------------------------------------------------


@pytest.mark.parametrize('sym', ['Cx', 'Nx', 'Hx', 'Ox', 'Sx'])
def test_symbol_registered_in_periodic_table(sym):
    assert sym in periodic_table


@pytest.mark.parametrize(
    'sym, atomic_number, mass',
    [
        ('Cx', 6, M_CX),
        ('Nx', 7, M_NX),
        ('Hx', 1, M_HX),
        ('Ox', 8, M_OX),
        ('Sx', 16, M_SX),
    ],
)
def test_periodic_table_entry(sym, atomic_number, mass):
    entry = periodic_table[sym]
    assert entry[0] == atomic_number  # atomic number
    assert entry[2] == pytest.approx([mass], rel=1e-9)  # single exact mass
    assert entry[3] == [1.0]  # 100 % abundance


@pytest.mark.parametrize(
    'formula',
    [
        'Cx6H12O6',  # [U-¹³C₆]-glucose
        'Cx5H8Nx2O3',  # partially labeled (¹³C + ¹⁵N)
        'Hx3C5H7O',  # deuterium-labeled
    ],
)
def test_parseSumFormula_accepts_labeled_formulas(formula):
    """parseSumFormula must not raise for any formula containing labeled elements."""
    result = parseSumFormula(formula)
    assert result is not None


# ---------------------------------------------------------------------------
# extract_labeled_mass_shift — ¹³C (Cx)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'formula, expected_shift, expected_remainder',
    [
        # No labeled elements → zero shift, formula unchanged
        ('H13O6', 0.0, 'H13O6'),
        ('C6H13O6', 0.0, 'C6H13O6'),
        # All 6 ¹³C atoms
        ('H13O6Cx6', 6 * M_CX, 'H13O6'),
        # Single ¹³C atom (count omitted)
        ('CxH3', M_CX, 'H3'),
        # Mixed labeled and natural carbon (partial label)
        ('Cx2C4H12O6', 2 * M_CX, 'C4H12O6'),
        # Labeled element at start
        ('Cx6H13O6', 6 * M_CX, 'H13O6'),
        # Count of 1 omitted
        ('CxH2O', M_CX, 'H2O'),
    ],
)
def test_extract_labeled_mass_shift_13C(formula, expected_shift, expected_remainder):
    shift, remainder = extract_labeled_mass_shift(formula)
    assert shift == pytest.approx(expected_shift, rel=1e-9)
    assert remainder == expected_remainder


# ---------------------------------------------------------------------------
# extract_labeled_mass_shift — other isotopes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'formula, expected_shift, expected_remainder',
    [
        ('H12Nx2O3', 2 * M_NX, 'H12O3'),  # ¹⁵N
        ('Hx3C5H7O', 3 * M_HX, 'C5H7O'),  # ²H
        ('C6H12OxO5', 1 * M_OX, 'C6H12O5'),  # ¹⁸O
        ('C2H4SxO', 1 * M_SX, 'C2H4O'),  # ³⁴S
    ],
)
def test_extract_labeled_mass_shift_other_isotopes(formula, expected_shift, expected_remainder):
    shift, remainder = extract_labeled_mass_shift(formula)
    assert shift == pytest.approx(expected_shift, rel=1e-9)
    assert remainder == expected_remainder


def test_extract_labeled_mass_shift_mixed_labels():
    """Formula with both Cx and Nx labels."""
    # Cx5H8Nx2O3: 5 ¹³C + 2 ¹⁵N
    shift, remainder = extract_labeled_mass_shift('Cx5H8Nx2O3')
    assert shift == pytest.approx(5 * M_CX + 2 * M_NX, rel=1e-9)
    assert remainder == 'H8O3'


def test_extract_labeled_mass_shift_entirely_labeled():
    """Formula with only Cx atoms: mass shift is correct, remainder is empty."""
    shift, remainder = extract_labeled_mass_shift('Cx6')
    assert shift == pytest.approx(6 * M_CX, rel=1e-9)
    assert remainder == ''


# ---------------------------------------------------------------------------
# has_labeled_elements
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'formula, expected',
    [
        ('C6H12O6', False),
        ('H13O6Cx6', True),
        ('CxH3', True),
        ('H2O', False),
        ('Cx5H8Nx2O3', True),
        ('Hx3C5H7O', True),
    ],
)
def test_has_labeled_elements(formula, expected):
    assert has_labeled_elements(formula) is expected
