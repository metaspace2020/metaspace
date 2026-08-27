"""Compare isotopic patterns produced by cpyMSpec/cpyMSpec_0_3_5 in the current interpreter
against a stored reference, to verify the pinned manylinux1 wheels behave identically across
Python versions (they are cffi ABI-mode bindings around a bundled prebuilt C++ library, so the
CPython version should not affect the numbers at all).

Run once on Python 3.8 (the current sm-engine container, where the wheels are already installed)
with --save to produce the reference JSON, then on the target Python (e.g. 3.14, in a throwaway
python:3.14-slim container with the same two packages pip-installed) with --check against that
reference file.

Gate: max abs m/z diff < 1e-9, max abs intensity diff < 1e-6.

The two code paths below mirror sm/engine/annotation/isocalc_wrapper.py::IsocalcWrapper
._centroids_uncached *exactly* (same module choice, same InstrumentModel construction, same
top-n-by-intensity trim then re-sort-by-mz), using the same defaults the engine's test fixture
uses (see metaspace/engine/tests/utils.py TEST_DS_CONFIG): charge=1, isocalc_sigma=0.000619,
instrument='FTICR', n_peaks=4. This is deliberately more thorough than just calling
isotopePattern(formula).addCharge(charge).masses (the uncentroided pattern) -- it exercises the
InstrumentModel + centroids() call the engine actually makes for both cpyMSpec_0_3_5
(analysis_version < 2) and cpyMSpec 0.4.2 (analysis_version >= 2).

No f-string-only or 3.9+ syntax is used so this runs unmodified on Python 3.8 and on 3.14.
"""

import argparse
import json
import sys

import cpyMSpec as cpyMSpec_0_4_2
import cpyMSpec_0_3_5

assert cpyMSpec_0_4_2.utils.VERSION == '0.4.2'
assert cpyMSpec_0_3_5.utils.VERSION == '0.3.5'

FORMULAS = [
    'C8H10N4O2',
    'C6H12O6',
    'C44H86NO8P',
    'C27H46O',
    'C10H16N5O13P3',
    'C21H27N7O14P2',
    'C45H78NO8P+H',
    'C16H32O2-H',
    'C63H98N18O13S',
    'C2H5OH',
]

# Matches TEST_DS_CONFIG['isotope_generation'] in metaspace/engine/tests/utils.py
CHARGE = 1
SIGMA = 0.000619
INSTRUMENT = 'FTICR'
N_PEAKS = 4
BASE_MZ = 200.0
SIGMA_TO_FWHM = 2.3548200450309493  # 2 * sqrt(2 * log(2)), copied from isocalc_wrapper.py

MZ_TOL = 1e-9
INT_TOL = 1e-6


def _trim(mzs, ints, k):
    """Pure-python re-implementation of IsocalcWrapper._trim (numpy-free so this script has
    no dependency on numpy being installable/pinned in the throwaway 3.X container)."""
    order = sorted(range(len(ints)), key=lambda i: ints[i], reverse=True)[:k]
    top_mzs = [mzs[i] for i in order]
    top_ints = [ints[i] for i in order]
    mz_order = sorted(range(len(top_mzs)), key=lambda i: top_mzs[i])
    return [top_mzs[i] for i in mz_order], [top_ints[i] for i in mz_order]


def _centroid_pattern(cpy_mspec_module, formula, version_lt2):
    """Mirrors IsocalcWrapper._centroids_uncached for a single (module, formula) pair."""
    iso_pattern = cpy_mspec_module.isotopePattern(formula)
    iso_pattern.addCharge(CHARGE)
    fwhm = SIGMA * SIGMA_TO_FWHM

    if version_lt2:
        # analysis_version < 2 path (cpyMSpec_0_3_5)
        resolving_power = iso_pattern.masses[0] / fwhm
        instrument_model = cpy_mspec_module.InstrumentModel('tof', resolving_power)
    else:
        # analysis_version >= 2 path (cpyMSpec 0.4.2)
        resolving_power = BASE_MZ / fwhm
        instrument_model = cpy_mspec_module.InstrumentModel(
            INSTRUMENT.lower(), resolving_power, at_mz=BASE_MZ
        )

    centr = iso_pattern.centroids(instrument_model)
    mzs = list(centr.masses)
    ints = [100.0 * x for x in centr.intensities]
    mzs, ints = _trim(mzs, ints, N_PEAKS)

    # Pad to N_PEAKS with zeros, exactly like IsocalcWrapper does with np.zeros
    n = len(mzs)
    mzs = mzs + [0.0] * (N_PEAKS - n)
    ints = ints + [0.0] * (N_PEAKS - n)
    return mzs, ints


def patterns():
    out = {}
    for formula in FORMULAS:
        mzs_035, ints_035 = _centroid_pattern(cpyMSpec_0_3_5, formula, version_lt2=True)
        out['0.3.5:' + formula] = {'mzs': mzs_035, 'ints': ints_035}

        mzs_042, ints_042 = _centroid_pattern(cpyMSpec_0_4_2, formula, version_lt2=False)
        out['0.4.2:' + formula] = {'mzs': mzs_042, 'ints': ints_042}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--save', help='Write the current environment patterns to this JSON file')
    ap.add_argument(
        '--check', help='Compare the current environment patterns against this JSON file'
    )
    args = ap.parse_args()

    if args.save:
        with open(args.save, 'w') as f:
            json.dump(patterns(), f, indent=2, sort_keys=True)
        print('saved')
        return 0

    if not args.check:
        ap.error('one of --save or --check is required')

    with open(args.check) as f:
        ref = json.load(f)
    cur = patterns()

    bad = []
    for key in ref:
        if key not in cur:
            bad.append((key, 'missing', None, None))
            continue
        for a, b in zip(ref[key]['mzs'], cur[key]['mzs']):
            if abs(a - b) > MZ_TOL:
                bad.append((key, 'mz', a, b))
        for a, b in zip(ref[key]['ints'], cur[key]['ints']):
            if abs(a - b) > INT_TOL:
                bad.append((key, 'int', a, b))

    if bad:
        print('DRIFT: %r' % (bad,))
        return 1
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
