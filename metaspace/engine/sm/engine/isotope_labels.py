"""Support for isotope-labeled elements in molecular formulas.

Defines pseudo-element symbols for stable isotope labels and registers them
into pyMSpec's ``periodic_table`` at import time so that the rest of the
pipeline (upload validation, mono-mass calculation, centroid generation)
accepts them transparently.

Each symbol uses the base-element letter followed by ``x`` (for "heavy
isotope").  All entries have a single isotope at 100 % abundance (a
delta-function mass), so the isotope pattern of a labeled compound equals
the natural-isotope pattern of the *remaining* atoms with every centroid m/z
shifted by ``total_labeled_mass / |charge|``.

Supported labels
----------------

+--------+---------+--------------------+--------------------------------------+
| Symbol | Isotope | Mono. mass (Da)    | Typical use                          |
+--------+---------+--------------------+--------------------------------------+
| ``Cx`` | ¹³C     | 13.00335484        | Carbon tracing (glucose, glutamine…) |
| ``Nx`` | ¹⁵N     | 15.00010889        | Nitrogen labeling, amino acids       |
| ``Hx`` | ²H      |  2.014101778       | Lipids, drugs, kinetic studies       |
| ``Ox`` | ¹⁸O     | 17.99915961        | Proteomics, water labeling           |
| ``Sx`` | ³⁴S     | 33.96786700        | Cysteine / methionine tracing        |
+--------+---------+--------------------+--------------------------------------+

Usage in custom databases
--------------------------
Use the symbol exactly like a regular element in the database TSV::

    id    name                    formula
    1     [U-¹³C₆]-glucose        Cx6H12O6
    2     [1,2-¹³C₂]-acetate      Cx2H3O2
    3     [U-¹⁵N₂]-glutamine      Cx5H8Nx2O3
    4     [U-²H₇]-cholesterol     C27H38HxO

METASPACE computes the correct isotope pattern and m/z by treating each
labeled atom as a delta-function at its exact isotopic mass and convolving
that with the natural-isotope pattern of the remaining atoms (equivalent to
a rigid m/z shift per unit charge).
"""

import re
from typing import Dict, Tuple

from pyMSpec.pyisocalc.periodic_table import periodic_table

# ---------------------------------------------------------------------------
# Label definitions
# ---------------------------------------------------------------------------

#: Metadata for every pseudo-element symbol.
#: ``mass`` is the exact monoisotopic mass in Da used for the m/z shift.
#: Masses are taken from the same source as pyMSpec's periodic_table entries
#: (AME / IUPAC values, consistent with periodicTable.ts in the webapp).
ISOTOPE_LABEL_ELEMENTS: Dict[str, dict] = {
    'Cx': {'description': 'pure ¹³C', 'natural_element': 'C', 'mass': 13.00335484},
    'Nx': {'description': 'pure ¹⁵N', 'natural_element': 'N', 'mass': 15.00010889},
    'Hx': {'description': 'pure ²H', 'natural_element': 'H', 'mass': 2.014101778},
    'Ox': {'description': 'pure ¹⁸O', 'natural_element': 'O', 'mass': 17.99915961},
    'Sx': {'description': 'pure ³⁴S', 'natural_element': 'S', 'mass': 33.96786700},
}

# Register pseudo-elements into pyMSpec's periodic table.
# Format: [atomic_number, valence, [mass_list], [abundance_list]]
# Single-isotope entry (abundance = 1.0) so parseSumFormula() and
# calculate_mono_mz() both see the correct exact mass.
_PERIODIC_TABLE_ENTRIES: Dict[str, list] = {
    'Cx': [6, -4, [13.00335484], [1.0]],
    'Nx': [7, 5, [15.00010889], [1.0]],
    'Hx': [1, 1, [2.014101778], [1.0]],
    'Ox': [8, -2, [17.99915961], [1.0]],
    'Sx': [16, -2, [33.96786700], [1.0]],
}
for _sym, _entry in _PERIODIC_TABLE_ENTRIES.items():
    if _sym not in periodic_table:
        periodic_table[_sym] = _entry

# ---------------------------------------------------------------------------
# Formula helpers
# ---------------------------------------------------------------------------

# Per-symbol substitution patterns: match the symbol followed by an optional
# integer count.  Built once at import time and reused for every call.
_LABEL_PATTERNS: Dict[str, re.Pattern] = {
    sym: re.compile(rf'{re.escape(sym)}(\d*)') for sym in ISOTOPE_LABEL_ELEMENTS
}


def extract_labeled_mass_shift(formula: str) -> Tuple[float, str]:
    """Separate isotope-labeled atoms from *formula* and return their exact mass.

    Because each pseudo-element represents a 100 %-pure isotope, it contributes
    a fixed mass offset with no isotope spread.  The isotope pattern of the full
    compound equals the natural-isotope pattern of the *remaining* atoms, with
    every centroid m/z shifted by ``mass_shift / |charge|``.

    Uses ``re.sub`` to remove only the labeled-element tokens while leaving the
    rest of the formula string intact.  This preserves any invalid characters
    (leading numbers, sign prefixes, etc.) so that downstream parsers can still
    reject ill-formed formulas as they did before.

    Args:
        formula: Ion formula string, e.g. ``'H13O6Cx6'``.

    Returns:
        ``(mass_shift, unlabeled_formula)`` where *mass_shift* is the total
        exact mass of all labeled atoms in Da, and *unlabeled_formula* is the
        formula string with all labeled atoms removed.

    Examples::

        >>> extract_labeled_mass_shift('H13O6Cx6')
        (78.02012904, 'H13O6')
        >>> extract_labeled_mass_shift('H13O6')
        (0.0, 'H13O6')
    """
    mass_shift = 0.0
    unlabeled = formula

    for sym, pattern in _LABEL_PATTERNS.items():
        elem_mass = ISOTOPE_LABEL_ELEMENTS[sym]['mass']

        def _replacer(m: re.Match, _mass: float = elem_mass) -> str:
            nonlocal mass_shift
            n = int(m.group(1)) if m.group(1) else 1
            mass_shift += _mass * n
            return ''

        unlabeled = pattern.sub(_replacer, unlabeled)

    return mass_shift, unlabeled


def has_labeled_elements(formula: str) -> bool:
    """Return ``True`` if *formula* contains any isotope-label pseudo-elements."""
    return any(pattern.search(formula) for pattern in _LABEL_PATTERNS.values())
