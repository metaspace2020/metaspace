import json

from hashlib import blake2b
from base64 import urlsafe_b64encode

import logging
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd

logging.getLogger('ibm_boto3').setLevel(logging.CRITICAL)
logging.getLogger('ibm_botocore').setLevel(logging.CRITICAL)
logging.getLogger('urllib3').setLevel(logging.CRITICAL)
logging.getLogger('engine').setLevel(logging.CRITICAL)

logger = logging.getLogger('annotation-pipeline')


class PipelineStats:
    path = None

    @classmethod
    def init(cls):
        Path('logs').mkdir(exist_ok=True)
        cls.path = datetime.now().strftime("logs/%Y-%m-%d_%H:%M:%S.csv")
        headers = ['Function', 'Actions', 'Memory', 'AvgRuntime', 'Cost', 'CloudObjects']
        pd.DataFrame([], columns=headers).to_csv(cls.path, index=False)

    @classmethod
    def _append(cls, content):
        pd.DataFrame(content).to_csv(cls.path, mode='a', header=False, index=False)

    @classmethod
    def append_pywren(cls, futures, memory_mb, cloud_objects_n=0):
        if type(futures) != list:
            futures = [futures]

        def calc_cost(runtimes, memory_gb):
            pywren_unit_price_in_dollars = 0.000017
            return sum([pywren_unit_price_in_dollars * memory_gb * runtime for runtime in runtimes])

        actions_num = len(futures)
        func_name = futures[0].function_name
        runtimes = [future.stats['exec_time'] for future in futures]
        cost = calc_cost(runtimes, memory_mb / 1024)
        cls._append(
            [[func_name, actions_num, memory_mb, np.average(runtimes), cost, cloud_objects_n]]
        )

    @classmethod
    def append_vm(cls, func_name, exec_time, cloud_objects_n=0):
        cls._append([[func_name, 'VM', '', exec_time, '', cloud_objects_n]])

    @classmethod
    def get(cls):
        stats = pd.read_csv(cls.path)
        print('Total PyWren cost: {:.3f} $'.format(stats['Cost'].sum()))
        return stats


def ds_imzml_path(ds_data_path):
    return next(str(p) for p in Path(ds_data_path).iterdir() if str(p).lower().endswith('.imzml'))


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
