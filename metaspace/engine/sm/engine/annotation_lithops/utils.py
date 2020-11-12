from __future__ import annotations

import json
import logging
from base64 import urlsafe_b64encode
from datetime import datetime
from hashlib import blake2b
from pathlib import Path

import numpy as np
import pandas as pd

# logging.getLogger('ibm_boto3').setLevel(logging.WARNING)
# logging.getLogger('ibm_botocore').setLevel(logging.WARNING)
# logging.getLogger('urllib3').setLevel(logging.WARNING)

logger = logging.getLogger('annotation-pipeline')


def ds_dims(coordinates):
    min_x, min_y = np.amin(coordinates, axis=0)[:2]
    max_x, max_y = np.amax(coordinates, axis=0)[:2]
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1
    return nrows, ncols


def get_pixel_indices(coordinates):
    _coord = np.array(coordinates)[:, :2]
    _coord = np.around(_coord, 5)
    _coord -= np.amin(_coord, axis=0)

    _, ncols = ds_dims(coordinates)
    pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
    pixel_indices = pixel_indices.astype(np.int32)
    return pixel_indices


def jsonhash(obj) -> str:
    """
    Calculates a hash for a JSON-stringifiable object. Intended for compacting large sets of
    parameters into a simple key that can be used to distinctly identify a cache entry.

    The output is collision-resistant, but shouldn't be assumed to be cryptographically secure.
    In most cases a motivated adversary could figure out the original object contents easily, as
    there's no hidden key and it's unlikely there will be much variety in the objects hashed.
    """
    json_val = json.dumps(obj, sort_keys=True)
    hash_val = blake2b(json_val.encode(), digest_size=12).digest()
    return str(urlsafe_b64encode(hash_val), 'utf-8')
