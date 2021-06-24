import json
from typing import Optional, cast, List

# NOTE: Python-client needs to support Python versions as low as Python 3.6.
# Make sure to run PyCharm's "Code Compatibility" inspection when touching any imports from typing
try:
    from typing import TypedDict, Literal  # Python 3.8+

    Polarity = Literal['Positive', 'Negative']
    MetadataDataType = Literal['Imaging MS']
except ImportError:
    try:
        from typing_extensions import TypedDict, Literal

        Polarity = Literal['Positive', 'Negative']
        MetadataDataType = Literal['Imaging MS']
    except ImportError:
        Polarity = str
        MetadataDataType = str
        TypedDict = dict


class MetadataSampleInformation(TypedDict):
    Organism: str
    Organism_Part: str
    Condition: str
    Sample_Growth_Conditions: Optional[str]


class MetadataSamplePreparation(TypedDict):
    Sample_Stabilisation: str
    Tissue_Modification: str
    MALDI_Matrix: str
    MALDI_Matrix_Application: str
    Solvent: Optional[str]


class MetadataResolvingPower(TypedDict):
    mz: float
    Resolving_Power: float


class MetadataPixelSize(TypedDict):
    Xaxis: float
    Yaxis: float


class MetadataMSAnalysis(TypedDict):
    Polarity: Polarity
    Ionisation_Source: str
    Analyzer: str
    Detector_Resolving_Power: MetadataResolvingPower
    Pixel_Size: str


class Metadata(TypedDict):
    """
    SMDataset.metadata should be accessed as a Python dict, e.g.

    >>> organism = dataset.metadata['Sample_Information']['Organism']
    """

    Data_Type: str  # Should always be 'Imaging MS'
    Sample_Information: MetadataSampleInformation
    Sample_Preparation: MetadataSamplePreparation
    MS_Analysis: MetadataMSAnalysis


class MetadataContainer(dict):
    def __init__(self, json_metadata):
        super().__init__(json.loads(json_metadata))
        self._json = json_metadata

    @property
    def json(self):
        return self._json


def make_metadata(json_metadata):
    """
    It's more user-friendly to access metadata as a TypedDict, but for backwards compatibility,
    it's necessary to provide the metadata.json property. TypedDicts don't seem to support
    custom constructors or non-dictionary properties at all.
    As a compromise, cast to `MetadataDict` so that users with type checking can access it as a
    TypedDict, but the .json property is still available as the instance type is a regular dict.
    """
    return cast(Metadata, MetadataContainer(json_metadata))


# Should match metaspace/engine/sm/engine/ds_config.py
# noinspection DuplicatedCode
class DSConfigIsotopeGeneration(TypedDict):
    adducts: List[str]
    charge: int
    isocalc_sigma: float
    instrument: str
    n_peaks: int
    neutral_losses: List[str]
    chem_mods: List[str]


# noinspection DuplicatedCode
class DSConfigFDR(TypedDict):
    decoy_sample_size: int


# noinspection DuplicatedCode
class DSConfigImageGeneration(TypedDict):
    ppm: int
    n_levels: int
    min_px: int


# noinspection DuplicatedCode
class DSConfig(TypedDict):
    """
    SMDataset.config should be accessed as a Python dict, e.g.

    >>> instrument = dataset.config['isotope_generation']['instrument']
    """

    database_ids: List[int]
    analysis_version: int
    isotope_generation: DSConfigIsotopeGeneration
    fdr: DSConfigFDR
    image_generation: DSConfigImageGeneration


class DatabaseDetails(TypedDict):
    """DEPRECATED - this has been replaced by metaspace.sm_annotation_utils.MolecularDB"""

    id: int
    name: str
    version: str
    isPublic: bool
    archived: bool


class DatasetDownloadLicense(TypedDict):
    code: str
    name: str
    link: Optional[str]


class DatasetDownloadContributor(TypedDict):
    name: Optional[str]
    institution: Optional[str]


class DatasetDownloadFile(TypedDict):
    filename: str
    link: str


class DatasetDownload(TypedDict):
    license: DatasetDownloadLicense
    contributors: List[DatasetDownloadContributor]
    files: List[DatasetDownloadFile]


class DatasetUser(TypedDict):
    id: str
    name: str


class DatasetGroup(TypedDict):
    id: str
    name: str
    shortName: str


class DatasetProject(TypedDict):
    id: str
    name: str
    publicationStatus: str
