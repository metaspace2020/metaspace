import argparse
import logging
from pathlib import Path

from msi_recal import process_imzml_file
from msi_recal.math import ppm_to_sigma_1
from msi_recal.params import RecalParams


def is_float_str(s):
    try:
        float(s)
        return True
    except ValueError:
        return False


def parse_transforms(args_transforms):
    transforms = []
    for arg_str in args_transforms:
        transform_name, *t_args = arg_str.split(',')
        if transform_name == 'align_msiwarp':
            assert len(t_args) <= 3, f'too many arguments to {transform_name}'
            assert all(map(is_float_str, t_args)), f'invalid arguments to {transform_name}'
        elif transform_name == 'align_ransac':
            assert len(t_args) <= 1, f'too many arguments to {transform_name}'
            assert all(map(is_float_str, t_args)), f'invalid arguments to {transform_name}'
        elif transform_name == 'recal_msiwarp':
            assert len(t_args) <= 3, f'too many arguments to {transform_name}'
            assert all(map(is_float_str, t_args)), f'invalid arguments to {transform_name}'
        elif transform_name == 'recal_ransac':
            assert len(t_args) <= 1, f'too many arguments to {transform_name}'
            assert all(map(is_float_str, t_args)), f'invalid arguments to {transform_name}'
        elif transform_name == 'normalize':
            assert len(t_args) <= 2, f'too many arguments to {transform_name}'
            assert (
                len(t_args) < 1 or t_args[0] == 'median' or is_float_str(t_args[0])
            ), f'invalid intensity argument to {transform_name}'
            assert len(t_args) < 2 or t_args[1] in (
                'tic',
                'max',
            ), f'invalid ref argument to {transform_name}'
        else:
            assert False, f'Unknown transform {transform_name}'

        transforms.append([transform_name, *t_args])
    return transforms


if __name__ == '__main__':

    DB_ROOT = Path(__file__).parent / 'dbs'
    BUILTIN_DBS = {
        'hmdb': DB_ROOT / 'HMDB-v4.csv',
        'cm3': DB_ROOT / 'CoreMetabolome-v3.csv',
        'dhb': DB_ROOT / 'DHB_clusters.csv',
        'dan': DB_ROOT / 'DAN_clusters.csv',
    }

    parser = argparse.ArgumentParser(
        description='Align & recalibrate imzML files',
        formatter_class=argparse.RawTextHelpFormatter,
        epilog='''
The "transform" argument is a space-separated list of functions (with optional comma-separated arguments) to run on the input file. The available functions are:

* align_msiwarp[,ppm,segments,precision] - use MSIWarp to align each spectrum to the mean spectrum.
This step is particularly slow, and takes even longer when ppm/segments are increased or precision decreased. 
    ppm (default 5) determines the maximum m/z shift
    segments (default 1) determines how many linear segments to use (usually not needed)
    precision (default 0.2) determines the precision of candidate m/z shifts in ppm
* align_ransac[,ppm] - use RANSAC to shift each spectrum toward the mean spectrum. Much faster than align_msiwarp, but lower quality.
    ppm (default 20) determines the maximum m/z shift
* recal_msiwarp[,ppm,segments,precision] - use MSIWarp to shift the mean spectrum toward matching reference peaks from the databases. This should be great for non-linear miscalibrations, but doesn't work so well with very large warpings.
    ppm (default 20) determines the maximum m/z shift
    segments (default 4) determines how many linear segments to use across the mass range
    precision (default 0.1) determines the precision of candidate m/z shifts in ppm
* recal_ransac[,ppm] - use RANSAC to shift the mean spectrum toward matching reference peaks from the databases. This works well for large warpings, but only does a linear transformation.
    ppm (default 500) determines the maximum m/z shift
* normalize[,intensity,ref] - normalize each spectrum to the TIC or maximum intensity
    intensity (default median) the value to scale each spectrum to. Either a number or 
        "median" to use the median reference value from all spectra. 
    ref (default tic) "tic" to scale intensities relative to the TIC. "max" to scale to the most 
        intense peak in the spectrum. 
        
Arguments are optional, e.g. these have the same effect: 
    msi_recal input.imzML align_msiwarp normalize
    msi_recal input.imzML align_msiwarp,5,1,0.2 normalize,median,tic
    
The default transform is "align_msiwarp recal_ransac recal_msiwarp"
''',
    )
    parser.add_argument('input', help='Input imzML file')
    parser.add_argument(
        'transform',
        help='Which transformation functions to use. See below',
        nargs='*',
        default=[
            'align_msiwarp,5,1,0.2',
            'recal_ransac,500',
            'recal_msiwarp,20,4,0.1',
        ],
    )
    parser.add_argument(
        '--output',
        help='Output path. If not specified, the input path with a _recal suffix will be used',
    )
    parser.add_argument(
        '--instrument',
        choices=['orbitrap', 'ft-icr', 'tof'],
        default='orbitrap',
        help='Analyzer type',
    )
    parser.add_argument(
        '--rp',
        type=float,
        default=140000,
        help='Analyzer resolving power (default 140000)',
    )
    parser.add_argument(
        '--base-mz',
        type=float,
        default=200.0,
        help='Base m/z value used for ppm calculations and resolving power (default 200)',
    )
    parser.add_argument(
        '--jitter',
        type=float,
        default=2.0,
        help='Maximum expected m/z error between spectra (after alignment) in ppm (default 2.0)',
    )
    parser.add_argument(
        '--polarity', choices=['positive', 'negative'], default='positive', help='Polarity'
    )
    parser.add_argument(
        '--adducts',
        help='Comma-separated list of adducts. (default "+H,+Na,+K,[M]+" for positive mode, "-H,+Cl,[M]-" for negative mode)',
    )
    parser.add_argument(
        '--db',
        action='append',
        help='''A preset database name (hmdb, cm3, dhb, dan) or a path to a csv/tsv file containing 
a "formula" column. Can be specified multiple times for multiple databases. 
By default it will use "cm3,dhb" for positive mode, "cm3,dan" for negative mode. However, the
defaults won't apply if any other value is specified, so re-add cm3 and dhb/dan if they're still wanted.
''',
    )
    parser.add_argument(
        '--debug',
        help='Directory to write debug files describing the detected alignment/recalibration parameters (default determined by input path)',
    )
    parser.add_argument(
        '--samples', type=int, default=100, help='How many spectra to use for model fitting'
    )
    parser.add_argument('--limit', type=int, help='Only consider the first N spectra')
    parser.add_argument('--no-debug', help='Suppress writing debug files')
    parser.add_argument('--verbose', '-v', action='count', default=2)
    parser.add_argument('--quiet', '-q', action='count', default=0)

    args = parser.parse_args()

    verbosity = min(max(args.verbose - args.quiet, 0), 3)
    logging.basicConfig(
        level=['ERROR', 'WARNING', 'INFO', 'DEBUG'][verbosity],
        format='%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s',
    )
    logging.getLogger('numba').setLevel('INFO')
    logging.getLogger('matplotlib').setLevel('INFO')

    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else None
    if args.debug:
        debug_path = Path(args.debug)
    elif not args.no_debug:
        debug_path = Path(f'{input_path.parent}/{input_path.stem}_debug/')
    else:
        debug_path = None

    assert input_path.exists(), f'{input_path} not found'

    if args.polarity == 'positive':
        charge = 1
        adducts = (args.adducts or '+H,+Na,+K,[M]+').split(',')
        dbs = args.db or ['cm3', 'dhb']
    else:
        charge = -1
        adducts = (args.adducts or '-H,+Cl,[M]-').split(',')
        dbs = args.db or ['cm3', 'dan']

    adducts = ['' if a in ('[M]+', '[M]-') else a for a in adducts]
    db_paths = [Path(BUILTIN_DBS.get(db, db)) for db in dbs]

    for db_path in db_paths:
        assert db_path.exists(), f'{db_path} not found'

    params = RecalParams(
        instrument=args.instrument,
        rp=args.rp,
        base_mz=args.base_mz,
        jitter_sigma_1=ppm_to_sigma_1(args.jitter, args.instrument, args.base_mz),
        charge=charge,
        db_paths=db_paths,
        adducts=adducts,
        passes=parse_transforms(args.transform),
    )

    process_imzml_file(
        input_path, params, output_path, debug_path, samples=args.samples, limit=args.limit
    )
