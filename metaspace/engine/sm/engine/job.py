import logging
from concurrent.futures.thread import ThreadPoolExecutor
from datetime import datetime
from typing import Union, Literal, Iterable, Optional

from sm.engine import molecular_db
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.errors import UnknownDSID
from sm.engine.es_export import ESExporter
from sm.engine.msm_basic.annotation_job import JobStatus
from sm.engine.png_generator import ImageStoreServiceWrapper

logger = logging.getLogger('engine')


IMG_URLS_BY_ID_SEL = ()


def get_ds_moldb_ids(ds_id: int, status: Optional[str] = None):
    if status is not None:
        return DB().select_onecol(
            'SELECT j.moldb_id FROM job j WHERE ds_id = %s AND status = %s', (ds_id, status)
        )
    else:
        return DB().select_onecol('SELECT j.moldb_id FROM job j WHERE ds_id = %s', (ds_id,))


def del_jobs(ds: Dataset, moldb_ids: Optional[Iterable[int]] = None):
    db = DB()
    es = ESExporter(db)
    img_store = ImageStoreServiceWrapper()

    try:
        storage_type = ds.get_ion_img_storage_type(db)
    except UnknownDSID:
        logger.warning('Attempt to delete job of non-existing dataset. Skipping')
        return

    if moldb_ids is None:
        moldb_ids = get_ds_moldb_ids(ds.id)
    moldbs = molecular_db.find_by_ids(moldb_ids)

    with ThreadPoolExecutor() as ex:
        for moldb in moldbs:
            logger.info(f'Deleting isotopic images: {ds.id=}, {ds.name=}, {moldb=}')
            img_id_rows = db.select_onecol(
                'SELECT iso_image_ids '
                'FROM annotation m '
                'JOIN job j ON j.id = m.job_id '
                'JOIN dataset d ON d.id = j.ds_id '
                'WHERE ds_id = %s AND j.moldb_id = ANY(%s)',
                (ds.id, moldb_ids),
            )
            for _ in ex.map(
                lambda img_id: img_store.delete_image_by_id(storage_type, 'iso_image', img_id),
                (img_id for img_ids in img_id_rows for img_id in img_ids if img_id is not None),
            ):
                pass

            logger.info(f"Deleting job results: {ds.id=} {ds.name=} {moldb=}")
            db.alter('DELETE FROM job WHERE ds_id = %s and moldb_id = %s', (ds.id, moldb.id))
            es.delete_ds(ds.id, moldb)


def insert_running_job(ds_id: str, moldb_id: int) -> int:
    """Store search job metadata in the database."""
    logger.info('Storing job metadata')
    return DB().insert_return(
        'INSERT INTO job (moldb_id, ds_id, status, start)'
        ' VALUES (%s, %s, %s, %s) '
        'RETURNING id',
        [(moldb_id, ds_id, JobStatus.RUNNING, datetime.now())],
    )[0]


def update_finished_job(
    job_id: int, job_status: str, finish: Union[datetime, None, Literal['now']] = 'now'
):
    if finish == 'now':
        finish = datetime.now()
    DB().alter(
        'UPDATE job set status=%s, finish=%s where id=%s',
        params=(job_status, finish, job_id),
    )
