"""Support for isotope-labeled elements in molecular formulas.

Defines pseudo-element symbols for stable isotope labels and registers them
into pyMSpec's ``periodic_table`` at import time so that the rest of the
pipeline (upload validation, mono-mass calculation, centroid generation)
accepts them transparently.

Currently supported labels
--------------------------
``X``  –  pure ¹³C  (monoisotopic mass 13.00335484 Da)

Usage in custom databases
--------------------------
Use the symbol exactly like a regular element in the database TSV::

    id    name                  formula
    1     [U-13C6]-glucose      X6H12O6
    2     [1,2-13C2]-acetate    X2H3O2

METASPACE computes the correct isotope pattern and m/z by treating each
``X`` atom as a delta-function at 13.00335484 Da and convolving that with
the natural-isotope pattern of the remaining atoms (which is equivalent to
simply shifting every centroid m/z by the total labeled-element mass divided
by the ion charge state).
"""

import re
from typing import Dict, List, Tuple

from pyMSpec.pyisocalc.periodic_table import periodic_table

# ---------------------------------------------------------------------------
# Label definitions
# ---------------------------------------------------------------------------

#: Metadata for every pseudo-element symbol.
#: ``mass`` is the exact monoisotopic mass used for the m/z shift.
ISOTOPE_LABEL_ELEMENTS: Dict[str, dict] = {
    'X': {
        'description': 'pure ¹³C',
        'natural_element': 'C',
        'mass': 13.00335484,
    },
}

# Register pseudo-elements into pyMSpec's periodic table.
# Format: [atomic_number, valence, [mass_list], [abundance_list]]
# Using a single-isotope entry (abundance = 1.0) so that parseSumFormula()
# and calculate_mono_mz() both see the correct exact mass.
_PERIODIC_TABLE_ENTRIES: Dict[str, list] = {
    'X': [6, -4, [13.00335484], [1.0]],
}
for _sym, _entry in _PERIODIC_TABLE_ENTRIES.items():
    if _sym not in periodic_table:
        periodic_table[_sym] = _entry

# ---------------------------------------------------------------------------
# Formula helpers
# ---------------------------------------------------------------------------

_ELEM_RE = re.compile(r'([A-Z][a-z]*)([0-9]*)')


def extract_labeled_mass_shift(formula: str) -> Tuple[float, str]:
    """Separate isotope-labeled atoms from *formula* and return their exact mass.

    Because each pseudo-element represents a 100 %-pure isotope, it contributes
    a fixed mass offset with no isotope spread.  The isotope pattern of the full
    compound equals the natural-isotope pattern of the *remaining* atoms, with
    every centroid m/z shifted by ``mass_shift / |charge|``.

    Args:
        formula: Ion formula string, e.g. ``'H13O6X6'``.

    Returns:
        ``(mass_shift, unlabeled_formula)`` where *mass_shift* is the total
        exact mass of all labeled atoms in Da, and *unlabeled_formula* is the
        formula string with all labeled atoms removed.

    Examples::

        >>> extract_labeled_mass_shift('H13O6X6')
        (78.02012904, 'H13O6')
        >>> extract_labeled_mass_shift('H13O6')
        (0.0, 'H13O6')
    """
    mass_shift = 0.0
    remaining: List[str] = []

    for elem, n_str in _ELEM_RE.findall(formula):
        n = int(n_str) if n_str else 1
        if elem in ISOTOPE_LABEL_ELEMENTS:
            mass_shift += ISOTOPE_LABEL_ELEMENTS[elem]['mass'] * n
        else:
            remaining.append(f'{elem}{n_str}')

    return mass_shift, ''.join(remaining)


def has_labeled_elements(formula: str) -> bool:
    """Return ``True`` if *formula* contains any isotope-label pseudo-elements."""
    return any(elem in ISOTOPE_LABEL_ELEMENTS for elem, _ in _ELEM_RE.findall(formula))
