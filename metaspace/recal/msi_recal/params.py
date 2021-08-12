import logging
import re
from pathlib import Path
from pprint import pformat
from typing import Union, Sequence

import cpyMSpec

try:
    from typing import Literal
except ImportError:
    from typing_extensions import Literal

logger = logging.getLogger(__name__)

PolarityType = Literal['positive', 'negative']
ANALYZER_TYPES = ('tof', 'orbitrap', 'ft-icr')
AnalyzerType = Literal['tof', 'orbitrap', 'ft-icr']
DefaultType = Literal['default']
DEFAULT: DefaultType = 'default'

DB_ROOT = Path(__file__).parent / 'dbs'

MATRIX_DBS = [f.stem for f in DB_ROOT.glob('matrix_*.csv')]
PARSED_MATRIX_DBS = sorted([matrix_db.split('_')[1:] for matrix_db in MATRIX_DBS])
MATRIXES = set(matrix for matrix, polarity in PARSED_MATRIX_DBS)
FORMATTED_MATRIXES = ', '.join(
    f'{matrix} ({"/".join(pols[::-1])})'
    for matrix in MATRIXES
    for pols in [[p for m, p in PARSED_MATRIX_DBS if m == matrix]]
)

BUILTIN_DBS = {
    'hmdb': DB_ROOT / 'HMDB-v4.csv',
    'cm3': DB_ROOT / 'CoreMetabolome-v3.csv',
    'lipid_maps': DB_ROOT / 'lipidmaps_2017-12-12-v2.tsv',
    **{matrix_db: DB_ROOT / f'{matrix_db}.csv' for matrix_db in MATRIX_DBS},
}


def normalize_analyzer_type(analyzer) -> AnalyzerType:
    """Detects analyzer type from a string and returns an MSIWarp-compatible analyzer string"""
    analyzer = (analyzer or '').lower()
    if 'orbitrap' in analyzer:
        return 'orbitrap'
    if any(phrase in analyzer for phrase in ['fticr', 'ft-icr', 'ftms', 'ft-ms']):
        return 'ft-icr'
    if 'tof' in analyzer:
        return 'tof'
    raise AssertionError(f'Unrecognized analyzer type "{analyzer}"')


def _default_adducts(polarity, source):
    if polarity.lower() == 'positive':
        if source.lower() == 'maldi':
            return ['', '+H', '+Na', '+K']
        else:
            return ['', '+H', '+Na', '-Cl', '+NH4']
    else:
        if source.lower() == 'maldi':
            return ['', '-H', '+Cl']
        else:
            return ['', '-H', '+Cl', '+HCO2']


class RecalParams:
    def __init__(
        self,
        analyzer: str = 'orbitrap',
        source: str = 'maldi',
        matrix: str = DEFAULT,
        polarity: PolarityType = 'positive',
        rp: float = 140000.0,
        base_mz: float = 200.0,
        peak_width_ppm: Union[float, DefaultType] = DEFAULT,
        jitter_ppm: float = 3.0,
        adducts: Union[Sequence[str], DefaultType] = DEFAULT,
        profile_mode: bool = False,
        dbs: Union[Sequence[Union[Path, str]], DefaultType] = DEFAULT,
        targeted_dbs: Union[Sequence[Union[Path, str]], DefaultType] = (),
        transforms: Union[Sequence[Sequence[str]], DefaultType] = DEFAULT,
    ):
        from msi_recal.math import ppm_to_sigma_1  # Avoid circular import

        assert polarity in ('positive', 'negative'), f'Invalid polarity "{polarity}"'

        self.analyzer = analyzer = normalize_analyzer_type(analyzer)
        self.rp = rp
        self.base_mz = base_mz
        if peak_width_ppm is DEFAULT:
            self.peak_width_ppm = 15 if profile_mode else 0
        else:
            self.peak_width_ppm = peak_width_ppm
        self.peak_width_sigma_1 = ppm_to_sigma_1(self.peak_width_ppm, analyzer, base_mz)
        self.jitter_ppm = jitter_ppm
        self.jitter_sigma_1 = ppm_to_sigma_1(self.jitter_ppm, analyzer, base_mz)

        if adducts is DEFAULT:
            adducts = _default_adducts(polarity, source)

        if matrix is DEFAULT:
            if 'maldi' in source.lower():
                matrix = {'positive': 'dhb', 'negative': 'dan'}.get(polarity.lower())
            else:
                matrix = None

        if dbs is DEFAULT:
            dbs = ['cm3']

        if matrix is not None and matrix.lower() != 'none':
            for mat in re.split('[,;/|]', matrix):
                norm_mat = mat.lower().strip()
                norm_mat = {'norharmane': 'nor'}.get(norm_mat, norm_mat)
                matrix_db = f'matrix_{norm_mat}_{polarity[:3]}'
                if matrix_db in BUILTIN_DBS:
                    dbs.append(matrix_db)
                else:
                    logger.warning(
                        f'No peak database available for matrix {mat}. Supported MALDI matrices:'
                        + FORMATTED_MATRIXES
                    )

        self.charge = {'positive': 1, 'negative': -1}[polarity]
        self.adducts = adducts
        self.profile_mode = profile_mode

        self.db_paths = [Path(BUILTIN_DBS.get(db, db)) for db in dbs]
        for db_path in self.db_paths:
            assert db_path.exists(), f'{db_path} not found'

        self.targeted_dbs = [Path(BUILTIN_DBS.get(db, db)) for db in targeted_dbs]

        if transforms is DEFAULT:
            transforms = [
                ['align_msiwarp', '5', '1', '0.2'],
                ['recal_ransac', '50'],
                # ['recal_msiwarp', '20', '4', '0.1'],
            ]
        self.transforms = transforms

        if analyzer == 'ft-icr':
            self.instrument_model = cpyMSpec.InstrumentModel('fticr', rp, base_mz)
        else:
            self.instrument_model = cpyMSpec.InstrumentModel(analyzer, rp, base_mz)

    def __repr__(self):
        return 'RecalParams ' + pformat(self.__dict__, sort_dicts=False)
