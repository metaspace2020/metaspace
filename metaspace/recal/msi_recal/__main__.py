import argparse
import logging
from pathlib import Path

from msi_recal import process_imzml_file
from msi_recal.params import RecalParams, DEFAULT, FORMATTED_MATRIXES


def is_float_str(s):
    try:
        float(s)
        return True
    except ValueError:
        return False


def parse_transforms(args_transforms):
    if not args_transforms:
        return DEFAULT

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


def parse_args():
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
        
If arguments aren't specified, the defaults will be used, e.g. these have the same effect: 
    msi_recal input.imzML align_msiwarp normalize
    msi_recal input.imzML align_msiwarp,5,1,0.2 normalize,median,tic
    
The default transform is "align_msiwarp recal_ransac"
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
        ],
    )
    parser.add_argument(
        '--output',
        help='Output path (default: input path with _recal suffix)',
    )
    parser.add_argument(
        '--no-output',
        help='Don\'t write an output file',
    )
    parser.add_argument(
        '--analyzer',
        choices=['orbitrap', 'ft-icr', 'tof'],
        default='orbitrap',
        help='Analyzer type (default: Orbitrap)',
    )
    parser.add_argument(
        '--source',
        default='maldi',
        help=f'Ionisation source (default: MALDI, only used for determining default adducts)',
    )
    parser.add_argument(
        '--matrix',
        default=DEFAULT,
        help=f'MALDI matrix to use for reference peaks. Supported values: {FORMATTED_MATRIXES}. '
        f'(default: dhb in positive mode/dan in negative mode. Use "none" to suppress the default)',
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
        default=3.0,
        help='Maximum expected centroid m/z imprecision in ppm (default 3.0)',
    )
    parser.add_argument(
        '--polarity', choices=['positive', 'negative'], default='positive', help='Polarity'
    )
    parser.add_argument(
        '--adducts',
        help='Comma-separated list of adducts. (default "+H,+Na,+K,[M]+" for positive mode, "-H,+Cl,[M]-" for negative mode)',
    )
    parser.add_argument(
        '--profile-mode', action='store_true', help='Set this flag for profile-mode data'
    )
    parser.add_argument(
        '--no-default-dbs', action='store_true', help='Suppress the default recalibration DBs'
    )
    parser.add_argument(
        '--db',
        action='append',
        help='''A preset database name (hmdb, cm3) or a path to a csv/tsv file containing 
a "formula" column listing molecules to use for recalibration. (default: cm3) 
Can be specified multiple times to add multiple databases. 
Specify --no-default-dbs to suppress the defaults.
''',
    )
    parser.add_argument(
        '--targeted-db',
        action='append',
        help='''A path to a csv/tsv file containing known molecules, which will be used even if 
        they don't have a good spectrum match''',
    )
    parser.add_argument(
        '--debug',
        help='Directory to write debug files describing the detected alignment/recalibration '
        'parameters (default: input path with _debug suffix)',
    )
    parser.add_argument('--no-debug', action='store_true', help='Suppress writing debug files')
    parser.add_argument(
        '--cache',
        help='Directory for cache files (default: input path with _cache suffix)',
    )
    parser.add_argument('--no-cache', action='store_true', help='Suppress using cache files')
    parser.add_argument(
        '--samples', type=int, default=100, help='How many spectra to use for model fitting'
    )
    parser.add_argument('--limit', type=int, help='Only consider the first N spectra')
    parser.add_argument('--verbose', '-v', action='count', default=2)
    parser.add_argument('--quiet', '-q', action='count', default=0)

    return parser.parse_args()


def main(args):
    verbosity = min(max(args.verbose - args.quiet, 0), 3)
    logging.basicConfig(
        level=['ERROR', 'WARNING', 'INFO', 'DEBUG'][verbosity],
        format='%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s',
    )
    logging.getLogger('numba').setLevel('INFO')
    logging.getLogger('matplotlib').setLevel('INFO')
    logger = logging.getLogger(__name__)

    input_path = Path(args.input)
    if args.no_output:
        output_path = None
    else:
        output_path = Path(args.output) if args.output else 'infer'
    if args.debug:
        debug_path = Path(args.debug)
    elif not args.no_debug:
        debug_path = 'infer'
    else:
        debug_path = None
    if args.cache:
        cache_path = Path(args.cache)
    elif not args.no_cache:
        cache_path = 'infer'
    else:
        cache_path = None

    assert input_path.exists(), f'{input_path} not found'

    if args.polarity == 'positive':
        adducts = (args.adducts or '+H,+Na,+K,[M]+').split(',')
    else:
        adducts = (args.adducts or '-H,+Cl,[M]-').split(',')
    adducts = ['' if a in ('[M]+', '[M]-') else a for a in adducts]

    dbs = args.db or []
    targeted_dbs = args.targeted_db or []
    if not args.no_default_dbs:
        dbs = sorted({'cm3', *dbs, *targeted_dbs})

    params = RecalParams(
        analyzer=args.analyzer,
        source=args.source,
        matrix=args.matrix,
        polarity=args.polarity,
        rp=args.rp,
        base_mz=args.base_mz,
        peak_width_ppm=15 if args.profile_mode else 0,
        jitter_ppm=args.jitter,
        adducts=adducts,
        profile_mode=args.profile_mode,
        dbs=dbs,
        targeted_dbs=targeted_dbs,
        transforms=parse_transforms(args.transform),
    )
    logger.debug(params)

    process_imzml_file(
        input_path=input_path,
        params=params,
        output_path=output_path,
        debug_path=debug_path,
        cache_path=cache_path,
        samples=args.samples,
        limit=args.limit,
    )


if __name__ == '__main__':
    main(parse_args())
