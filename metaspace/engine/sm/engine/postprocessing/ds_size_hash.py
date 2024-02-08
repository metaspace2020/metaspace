import json
import hashlib
import logging
import time

from lithops.storage.utils import CloudObject


from sm.engine.annotation_lithops.executor import Executor
from sm.engine.dataset import Dataset
from sm.engine.db import DB

logger = logging.getLogger('engine')


def save_size_hash(
        executor: Executor,
        ds: Dataset,
        db: DB,
        imzml_cobj: CloudObject,
        ibd_cobj: CloudObject
) -> None:
    """Calculate md5 hash of imzML/ibd files and store this with file size."""

    def calc_hash(file_object: CloudObject, chunk_size: int = 8 * 1024 ** 2) -> str:
        md5_hash = hashlib.md5()
        chunk = file_object.read(chunk_size)
        while chunk:
            md5_hash.update(chunk)
            chunk = file_object.read(chunk_size)

        return md5_hash.hexdigest()

    imzml_head = executor.storage.head_object(imzml_cobj.bucket, imzml_cobj.key)
    ibd_head = executor.storage.head_object(ibd_cobj.bucket, ibd_cobj.key)

    logger.info('MD5 hash calculating ...')
    start_t = time.time()
    ds_size_hash = {
        'imzml_hash': calc_hash(executor.storage.get_cloudobject(imzml_cobj, stream=True)),
        'ibd_hash': calc_hash(executor.storage.get_cloudobject(ibd_cobj, stream=True)),
        'imzml_size': int(imzml_head['content-length']),
        'ibd_size': int(ibd_head['content-length']),
    }
    logger.info(f'MD5 hash calculation for imzML/ibd files: {round(time.time() - start_t, 1)} sec')

    db.alter(
        'UPDATE dataset SET size_hash = %s WHERE id = %s',
        (json.dumps(ds_size_hash), ds.id),
    )
