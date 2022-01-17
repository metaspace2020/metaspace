import logging
from datetime import datetime
from typing import Iterable, Optional

from sm.engine import molecular_db
from sm.engine.annotation.diagnostics import del_diagnostics
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine import image_storage

logger = logging.getLogger('engine')


class JobStatus:
    RUNNING = 'RUNNING'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'


def get_ds_moldb_ids(ds_id: str, status: Optional[str] = None):
    if status is not None:
        return DB().select_onecol(
            'SELECT j.moldb_id FROM job j WHERE ds_id = %s AND status = %s', (ds_id, status)
        )
    return DB().select_onecol('SELECT j.moldb_id FROM job j WHERE ds_id = %s', (ds_id,))


def del_jobs(ds: Dataset, moldb_ids: Optional[Iterable[int]] = None):
    """
    Delete a dataset's jobs for the specified moldbs, or all jobs if moldb_ids is None.
    Also cleans up the annotations from ElasticSearch and deletes their ion images.
    """
    db = DB()
    es = ESExporter(db)

    if moldb_ids is None:
        moldb_ids = get_ds_moldb_ids(ds.id)
    moldbs = molecular_db.find_by_ids(moldb_ids)

    job_ids = DB().select_onecol(
        'SELECT j.id FROM job j WHERE ds_id = %s AND moldb_id = ANY(%s)', (ds.id, list(moldb_ids))
    )
    del_diagnostics(ds.id, job_ids)

    for moldb in moldbs:
        logger.info(f'Deleting isotopic images: ds_id={ds.id} ds_name={ds.name} moldb={moldb}')
        img_id_rows = db.select_onecol(
            'SELECT iso_image_ids '
            'FROM annotation m '
            'JOIN job j ON j.id = m.job_id '
            'JOIN dataset d ON d.id = j.ds_id '
            'WHERE ds_id = %s AND j.moldb_id = %s',
            (ds.id, moldb.id),
        )

        image_ids = [img_id for img_ids in img_id_rows for img_id in img_ids if img_id is not None]
        image_storage.delete_images(image_storage.ISO, ds.id, image_ids)

        logger.info(f"Deleting job results: ds_id={ds.id} ds_name={ds.name} moldb={moldb}")
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


def update_finished_job(job_id: int, job_status: str):
    """Update a job's status and set the finish time to now"""
    finish = datetime.now()

    DB().alter(
        'UPDATE job set status=%s, finish=%s where id=%s',
        params=(job_status, finish, job_id),
    )
