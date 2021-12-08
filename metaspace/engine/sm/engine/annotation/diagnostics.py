import logging
import pickle
from collections import defaultdict
from datetime import datetime
from enum import Enum
from io import BytesIO
from traceback import format_exc
from typing import Optional, Any, Union, List, TypedDict, Dict

import numpy as np
import pandas as pd
import zstandard

from sm.engine import image_storage
from sm.engine.annotation.imzml_reader import ImzMLReader
from sm.engine.db import DB
from sm.engine.utils.numpy_json_encoder import numpy_json_dumps

logger = logging.getLogger('engine')


class DiagnosticType(str, Enum):
    """Should match the enum in metaspace/graphql/src/modules/dataset/model.ts"""

    TIC = 'TIC'
    IMZML_METADATA = 'IMZML_METADATA'
    FDR_RESULTS = 'FDR_RESULTS'


class DiagnosticImageKey(str, Enum):
    # if type == DiagnosticType.TIC:
    TIC = 'TIC'
    # if type == DiagnosticType.IMZML_METADATA
    MASK = 'MASK'
    FDR_RESULTS = 'FDR_RESULTS'


class DiagnosticImageFormat(str, Enum):
    PNG = 'PNG'
    NPY = 'NPY'
    JSON = 'JSON'
    # TODO: Replace this
    PICKLE_ZSTD = (
        'PICKLE_ZSTD'  # NEVER USE THIS. If you do use it, never load it from inside Python code,
    )
    # because pickle files can run any code they want during loading and there is no way to secure it.
    # Also, pickle files tend to break between versions


class DiagnosticImage(TypedDict, total=False):
    key: Optional[str]
    index: Optional[int]
    image_id: str  # required
    url: str  # required
    format: DiagnosticImageFormat  # required


class DatasetDiagnostic(TypedDict, total=False):
    ds_id: str  # required
    job_id: Optional[int]
    type: str  # required
    data: Any
    error: Union[str, None]
    images: List[DiagnosticImage]


def add_diagnostics(diagnostics: List[DatasetDiagnostic]):
    """Upserts dataset diagnostics, overwriting existing values with the same ds_id, job_id, type"""
    # Validate input, as postgres can't enforce the JSON columns have the correct schema,
    # and many places (graphql, python client, etc.) rely on these structures.
    for diagnostic in diagnostics:
        assert 'ds_id' in diagnostic
        assert 'type' in diagnostic
        images = diagnostic.get('images', [])
        assert all(image['key'] in DiagnosticImageKey for image in images)
        assert all(image['format'] in DiagnosticImageFormat for image in images)
        assert all(image['image_id'] in image['url'] for image in images)
        image_keys = set((image.get('key'), image.get('index')) for image in images)
        assert len(image_keys) == len(images), 'diagnostic image keys should be unique'

    db = DB()
    # Find all diagnostics that should be replaced by the new diagnostics
    existing = db.select_with_fields(
        """
        WITH new_diagnostic AS (
            SELECT UNNEST(%s::text[]) as ds_id, UNNEST(%s::int[]) as job_id,
            UNNEST(%s::text[]) as type
        )
        SELECT dd.ds_id, dd.id, dd.images
        FROM new_diagnostic nd
        JOIN dataset_diagnostic dd ON nd.ds_id = dd.ds_id
            AND (nd.job_id = dd.job_id OR (nd.job_id IS NULL AND dd.job_id is NULL))
            AND nd.type = dd.type
        """,
        list(map(list, zip(*((d['ds_id'], d.get('job_id'), d['type']) for d in diagnostics)))),
    )

    if existing:
        # Delete existing images
        image_ids_by_ds = defaultdict(list)
        for row in existing:
            for img in row['images'] or []:
                image_ids_by_ds[row['ds_id']].append(img['image_id'])
        for ds_id, image_ids in image_ids_by_ds.items():
            image_storage.delete_images(image_storage.DIAG, ds_id, image_ids)

        # Delete existing DB rows
        db.alter(
            'DELETE FROM dataset_diagnostic WHERE id = ANY(%s::uuid[])',
            ([row['id'] for row in existing],),
        )

    db.insert(
        'INSERT INTO dataset_diagnostic (ds_id, job_id, type, updated_dt, data, error, images) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s)',
        [
            (
                d['ds_id'],
                d.get('job_id'),
                d['type'],
                datetime.now(),
                numpy_json_dumps(d['data']) if d.get('data') is not None else None,
                d.get('error'),
                numpy_json_dumps(d.get('images', [])),
            )
            for d in diagnostics
        ],
    )


def del_diagnostics(ds_id: str, job_ids: Optional[List[int]] = None):
    db = DB()
    if job_ids is None:
        existing = db.select_with_fields(
            'SELECT id, images FROM dataset_diagnostic dd WHERE dd.ds_id = %s',
            [ds_id],
        )
    else:
        existing = db.select_with_fields(
            'SELECT id, images FROM dataset_diagnostic dd '
            'WHERE dd.ds_id = %s AND dd.job_id = ANY(%s)',
            [ds_id, job_ids],
        )

    if existing:
        # Delete existing images
        image_ids = [img['image_id'] for row in existing for img in row['images'] or []]
        image_storage.delete_images(image_storage.DIAG, ds_id, image_ids)

        # Delete existing DB rows
        db.alter(
            'DELETE FROM dataset_diagnostic WHERE id = ANY(%s::uuid[])',
            ([row['id'] for row in existing],),
        )


def get_dataset_diagnostics(ds_id: str):
    return DB().select_with_fields(
        'SELECT ds_id, job_id, type, data, error, images FROM dataset_diagnostic WHERE ds_id = %s',
        (ds_id,),
    )


def save_npy_image(ds_id: str, arr: np.ndarray):
    buf = BytesIO()
    np.save(buf, arr, allow_pickle=False)
    buf.seek(0)
    return image_storage.post_image(image_storage.DIAG, ds_id, buf)


def save_pickle_image(ds_id: str, data):
    buf = BytesIO()
    cctx = zstandard.ZstdCompressor(level=3)
    with cctx.stream_writer(buf, closefd=False) as writer:
        pickle.dump(data, writer)
    buf.seek(0)
    return image_storage.post_image(image_storage.DIAG, ds_id, buf)


def save_diagnostic_image(
    ds_id: str, data: Any, key, index=None, format=DiagnosticImageFormat.NPY
) -> DiagnosticImage:
    assert key in DiagnosticImageKey
    if format is DiagnosticImageFormat.NPY:
        image_id = save_npy_image(ds_id, data)
    elif format is DiagnosticImageFormat.JSON:
        image_id = image_storage.post_image(
            image_storage.DIAG, ds_id, BytesIO(numpy_json_dumps(data).encode())
        )
    else:
        assert (
            format == DiagnosticImageFormat.PICKLE_ZSTD
        ), 'Unknown format passed to save_diagnostic_image'
        image_id = save_pickle_image(ds_id, data)
    image = {
        'key': key,
        'image_id': image_id,
        'url': image_storage.get_image_url(image_storage.DIAG, ds_id, image_id),
        'format': format,
    }

    if index is not None:
        image['index'] = index
    return image


def load_npy_image(ds_id: str, image_id: str):
    buf = image_storage.get_image(image_storage.DIAG, ds_id, image_id)
    return np.load(BytesIO(buf), allow_pickle=False)


def extract_dataset_diagnostics(
    ds_id: str, imzml_reader: ImzMLReader, results_dfs: Dict[int, pd.DataFrame]
):
    def run_diagnostic_fn(type, fn):
        try:
            result = fn()
        except Exception:
            logger.exception(f'Exception generating {type} diagnostic', exc_info=True)
            result = {'error': format_exc()}
        return {'ds_id': ds_id, 'type': type, **result}

    def metadata_diagnostic():
        mask_image = save_diagnostic_image(ds_id, imzml_reader.mask, DiagnosticImageKey.MASK)
        return {
            'data': {
                'n_spectra': imzml_reader.n_spectra,
                'min_coords': imzml_reader.raw_coord_bounds[0].tolist(),
                'max_coords': imzml_reader.raw_coord_bounds[1].tolist(),
                'min_mz': np.asscalar(imzml_reader.min_mz)
                if np.isfinite(imzml_reader.min_mz)
                else 0,
                'max_mz': np.asscalar(imzml_reader.max_mz)
                if np.isfinite(imzml_reader.max_mz)
                else 0,
                'metadata': imzml_reader.metadata_summary,
            },
            'images': [mask_image],
        }

    def tic_diagnostic():
        tic = imzml_reader.tic_image()
        tic_vals = tic[~np.isnan(tic)]
        tic_image = save_diagnostic_image(ds_id, tic, key=DiagnosticImageKey.TIC)

        return {
            'data': {
                'min_tic': np.nan_to_num(np.min(tic_vals).item()) if len(tic_vals) else 0,
                'max_tic': np.nan_to_num(np.max(tic_vals).item()) if len(tic_vals) else 0,
                'sum_tic': np.nan_to_num(np.sum(tic_vals).item()) if len(tic_vals) else 0,
                'is_from_metadata': imzml_reader.is_tic_from_metadata,
            },
            'images': [tic_image],
        }

    def fdr_results_diagnostic():
        # FIXME: Convert this into a "job diagnostic"
        return {
            'images': [
                save_diagnostic_image(
                    ds_id,
                    results_df,
                    key=DiagnosticImageKey.FDR_RESULTS,
                    index=db_id,
                    format=DiagnosticImageFormat.PICKLE_ZSTD,
                )
                for db_id, results_df in results_dfs.items()
            ]
        }

    return [
        run_diagnostic_fn(DiagnosticType.IMZML_METADATA, metadata_diagnostic),
        run_diagnostic_fn(DiagnosticType.TIC, tic_diagnostic),
        run_diagnostic_fn(DiagnosticType.FDR_RESULTS, fdr_results_diagnostic),
    ]
