"""Unit tests for sm.engine.isotope_labels."""

import pytest
from pyMSpec.pyisocalc.periodic_table import periodic_table
from pyMSpec.pyisocalc.pyisocalc import parseSumFormula

import sm.engine.isotope_labels  # noqa: F401 — patches periodic table
from sm.engine.isotope_labels import extract_labeled_mass_shift, has_labeled_elements

M_13C = 13.00335484


# ---------------------------------------------------------------------------
# Periodic table patch
# ---------------------------------------------------------------------------


def test_x_registered_in_periodic_table():
    assert 'X' in periodic_table


def test_x_periodic_table_entry():
    entry = periodic_table['X']
    assert entry[0] == 6               # atomic number (carbon)
    assert entry[2] == [M_13C]         # single exact mass
    assert entry[3] == [1.0]           # 100 % abundance


def test_x_accepted_by_parseSumFormula():
    """parseSumFormula must not raise for formulas containing X."""
    result = parseSumFormula('X6H12O6')
    assert result is not None


# ---------------------------------------------------------------------------
# extract_labeled_mass_shift
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'formula, expected_shift, expected_remainder',
    [
        # No labeled elements → zero shift, formula unchanged
        ('H13O6', 0.0, 'H13O6'),
        ('C6H13O6', 0.0, 'C6H13O6'),
        # All 6 13C atoms
        ('H13O6X6', 6 * M_13C, 'H13O6'),
        # Single 13C atom
        ('XH3', M_13C, 'H3'),
        # Mixed labeled and natural carbon (partial label)
        ('X2C4H12O6', 2 * M_13C, 'C4H12O6'),
        # Labeled element at the start of the formula
        ('X6H13O6', 6 * M_13C, 'H13O6'),
        # Count of 1 omitted from formula string
        ('XH2O', M_13C, 'H2O'),
    ],
)
def test_extract_labeled_mass_shift(formula, expected_shift, expected_remainder):
    shift, remainder = extract_labeled_mass_shift(formula)
    assert shift == pytest.approx(expected_shift, rel=1e-9)
    assert remainder == expected_remainder


def test_extract_labeled_mass_shift_entirely_labeled():
    """Formula with only X atoms: mass shift is correct, remainder is empty."""
    shift, remainder = extract_labeled_mass_shift('X6')
    assert shift == pytest.approx(6 * M_13C, rel=1e-9)
    assert remainder == ''


# ---------------------------------------------------------------------------
# has_labeled_elements
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    'formula, expected',
    [
        ('C6H12O6', False),
        ('H13O6X6', True),
        ('XH3', True),
        ('H2O', False),
    ],
)
def test_has_labeled_elements(formula, expected):
    assert has_labeled_elements(formula) is expected
