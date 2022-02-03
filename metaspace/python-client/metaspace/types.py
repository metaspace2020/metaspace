import json
import numpy as np
from typing import TYPE_CHECKING, Optional, cast, List, Any

# NOTE: Python-client needs to support Python versions as low as Python 3.6.
# Make sure to run PyCharm's "Code Compatibility" inspection when touching any imports from typing
if TYPE_CHECKING:
    from metaspace.sm_annotation_utils import MolecularDB

try:
    from typing import TypedDict, Literal  # Python 3.8+

    Polarity = Literal['Positive', 'Negative']
    MetadataDataType = Literal['Imaging MS']
    DiagnosticImageFormat = Literal['PNG', 'NPY']
except ImportError:
    try:
        from typing_extensions import TypedDict, Literal

        Polarity = Literal['Positive', 'Negative']
        MetadataDataType = Literal['Imaging MS']
        DiagnosticImageFormat = Literal['PNG', 'NPY']
    except ImportError:
        Polarity = str
        MetadataDataType = str
        DiagnosticImageFormat = str
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
    Pixel_Size: MetadataPixelSize


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


class DiagnosticImage(TypedDict):
    """Represents one image associated with a category of diagnostics/metadata.

    The `key` field indicates the content.

    The `image` field is only present when :py:attr:`sm_annotation_utils.SMDataset.diagnostics`
        is called with include_images=True

    """

    key: Optional[str]
    index: Optional[int]
    url: str
    format: DiagnosticImageFormat
    image: Optional[np.ndarray]


class DatasetDiagnostic(TypedDict):
    """
    Represents the results of one category of diagnostics/metadata for the dataset.
    The `type` field indicates the content:
      * type==TIC
        - `data` contains information about the Total Ion Current across the dataset
        - `images` contains an image with the TIC for each spectrum
      * type==IMZML_METADATA
        - `data` contains a summary of metadata from the ImzML file header
        - `images` contains a boolean image of which pixels had spectra in the input data.
            Useful for non-square acquisition areas.
    """

    id: str
    type: str
    jobId: Optional[int]
    database: Optional['MolecularDB']
    data: Any
    images: List[DiagnosticImage]
