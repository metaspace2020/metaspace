from datetime import datetime
from typing import Literal, Optional, Any, Union, List

from sm.engine import image_storage
from sm.engine.db import DB

DiagnosticImageFormat = Literal['PNG', 'NPY']
# Should match the enum in metaspace/graphql/src/modules/dataset/model.ts
DiagnosticType = Literal['TIC', 'IMZML_METADATA']


class DiagnosticTypes:
    TIC: DiagnosticType = 'TIC'
    IMZML_METADATA: DiagnosticType = 'IMZML_METADATA'


class DiagnosticImage:
    key: Optional[str]
    index: Optional[int]
    image_id: str
    format: DiagnosticImageFormat


class DatasetDiagnostic:
    ds_id: str
    job_id: Optional[int]
    type: str
    data: Any
    error: Union[str, None]
    images: List[DiagnosticImage]


def save_diagnostics(diagnostics: List[DatasetDiagnostic]):
    db = DB()
    # Find all diagnostics that should be replaced by the new diagnostics
    existing = db.select(
        """
        WITH new_diagnostic AS (
            SELECT UNNEST(%s::text[]) as ds_id, UNNEST(%s::text[]) as job_id, 
            UNNEST(%s::text[]) as type
        )
        SELECT ds_id, id, images 
        FROM new_diagnostic nd
        JOIN dataset_diagnostic dd ON nd.ds_id = dd.ds_id
            AND (nd.job_id = dd.job_id OR (nd.job_id IS NULL AND dd.job_id is NULL))
            AND nd.type = dd.type
        """,
        list(zip(*((d.ds_id, d.job_id, d.type) for d in diagnostics))),
    )

    if existing:
        # Delete existing images
        for row in existing:
            for img in row['images'] or []:
                image_storage.delete_image(image_storage.DIAG, row.ds_id, img.image_id)
        # Delete existing DB rows
        db.alter(
            'DELETE FROM dataset_diagnostic WHERE id = ANY(%s)', [row['id'] for row in existing]
        )

    db.insert(
        'INSERT INTO dataset_diagnostic (ds_id, job_id, type, updated_dt, data, error, images) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
        [
            (d.ds_id, d.job_id, d.type, datetime.now(), d.data, d.error, d.images)
            for d in diagnostics
        ],
    )


def delete_diagnostics(ds_id: str, job_ids: Optional[List[int]] = None):
    db = DB()
    if job_ids is None:
        existing = db.select(
            'SELECT id, images FROM dataset_diagnostic dd WHERE dd.ds_id = %s',
            [ds_id],
        )
    else:
        existing = db.select(
            'SELECT id, images FROM dataset_diagnostic dd '
            'WHERE dd.ds_id = %s AND dd.job_id = ANY(%s)',
            [ds_id, job_ids],
        )

    if existing:
        # Delete existing images
        for row in existing:
            for img in row['images'] or []:
                image_storage.delete_image(image_storage.DIAG, ds_id, img.image_id)
        # Delete existing DB rows
        db.alter(
            'DELETE FROM dataset_diagnostic WHERE id = ANY(%s)', [row['id'] for row in existing]
        )
