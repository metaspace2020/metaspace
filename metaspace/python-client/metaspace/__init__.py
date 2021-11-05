__version__ = '1.8.11'

from metaspace.sm_annotation_utils import (
    SMInstance,
    GraphQLClient,
    DatasetNotFound,
)
from metaspace.image_processing import clip_hotspots, colocalization, colocalization_matrix
