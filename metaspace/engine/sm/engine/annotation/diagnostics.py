import logging
from collections import defaultdict
from datetime import datetime
from enum import Enum
from io import BytesIO
from traceback import format_exc
from typing import Optional, Any, Union, List, TypedDict

import numpy as np
import pandas as pd

from sm.engine import image_storage
from sm.engine.annotation.imzml_reader import ImzMLReader
from sm.engine.db import DB
from sm.engine.utils.numpy_json_encoder import numpy_json_dumps

logger = logging.getLogger('engine')


class DiagnosticType(str, Enum):
    """Should match the enum in metaspace/graphql/src/modules/engine/model.ts"""

    TIC = 'TIC'
    IMZML_METADATA = 'IMZML_METADATA'
    FDR_RESULTS = 'FDR_RESULTS'


class DiagnosticImageKey(str, Enum):
    # if type == DiagnosticType.TIC:
    TIC = 'TIC'
    # if type == DiagnosticType.IMZML_METADATA
    MASK = 'MASK'
    # if type == DiagnosticType.FDR_RESULTS
    DECOY_MAP_DF = 'DECOY_MAP_DF'
    FORMULA_MAP_DF = 'FORMULA_MAP_DF'
    METRICS_DF = 'METRICS_DF'


class DiagnosticImageFormat(str, Enum):
    """This should match the enums in graphql/schemas/dataset.graphql
    and metaspace/graphql/src/modules/engine/model.ts"""

    PNG = 'PNG'
    NPY = 'NPY'
    JSON = 'JSON'
    PARQUET = 'PARQUET'


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


class FdrDiagnosticBundle(TypedDict):
    """Holds the inputs required to save a FDR diagnostic for one job"""

    decoy_sample_size: int
    decoy_map_df: pd.DataFrame
    """decoy_map_df lists each base formula and the pairs of target modifier and decoy modifiers,
    This is the comprehensive set - all formulas are included and exactly `decoy_sample_size` decoys
    exist per base formula + target modifier combination, unfiltered by mass, metrics or formula
    validity.

    Columns: formula, tm, dm
    """
    formula_map_df: pd.DataFrame
    """formula_map_df associates the filtered formula + (target/decoy) modifiers with their
    corresponding formula_i. Multiple formula+modifiers can have the same formula_i if they sum to
    the same element counts. Some rows may be missing if excluded due to mass or invalid formulas.

    Columns:
        formula - base formula of the molecule
        modifier - matches tm or dm from decoy_map_df
        formula_i - index into metrics_df
    """
    metrics_df: pd.DataFrame
    """metrics_df contains the calculated metrics for each tested annotation. Array-valued columns
    (listed in METRICS_ARRAY_COLUMNS) are unpacked into separate columns for better storage.

    Index: formula_i
    Columns: See `Metrics` class for the full list
    """


def add_diagnostics(diagnostics: List[DatasetDiagnostic]):
    """Upserts dataset diagnostics, overwriting existing values with the same ds_id, job_id, type"""
    # Validate input, as postgres can't enforce the JSON columns have the correct schema,
    # and many places (graphql, python client, etc.) rely on these structures.

    if not diagnostics:
        return

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
        logger.debug(
            f'Deleting {len(existing)} existing diagnostics for dataset {existing[0]["ds_id"]}'
        )
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

    logger.debug(f'Inserting {len(diagnostics)} diagnostics for dataset {diagnostics[0]["ds_id"]}')
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


def save_parquet_image(ds_id: str, data):
    assert isinstance(data, (pd.DataFrame, pd.Series)), 'Parquet data must be a DataFrame or Series'

    buf = BytesIO(data.to_parquet())
    return image_storage.post_image(image_storage.DIAG, ds_id, buf)


def save_diagnostic_image(
    ds_id: str, data: Any, key, index=None, fmt=DiagnosticImageFormat.NPY
) -> DiagnosticImage:
    assert key in DiagnosticImageKey
    if fmt == DiagnosticImageFormat.NPY:
        image_id = save_npy_image(ds_id, data)
    elif fmt == DiagnosticImageFormat.JSON:
        image_id = image_storage.post_image(
            image_storage.DIAG, ds_id, BytesIO(numpy_json_dumps(data).encode())
        )
    elif fmt == DiagnosticImageFormat.PARQUET:
        image_id = save_parquet_image(ds_id, data)
    else:
        raise ValueError(f'Unknown format: {fmt}')
    image = DiagnosticImage(
        key=key,
        image_id=image_id,
        url=image_storage.get_image_url(image_storage.DIAG, ds_id, image_id),
        format=fmt,
    )

    if index is not None:
        image['index'] = index
    return image


def load_npy_image(ds_id: str, image_id: str):
    buf = image_storage.get_image(image_storage.DIAG, ds_id, image_id)
    return np.load(BytesIO(buf), allow_pickle=False)


def _run_diagnostic_fn(ds_id, type_, fn):
    # Try several times because occasionally lag/network issues cause object upload to timeout.
    for attempt in range(3):
        try:
            result = fn()
            break
        except Exception:
            logger.exception(
                f'Exception generating {type_} diagnostic after {attempt + 1} attempts',
                exc_info=True,
            )
            result = {'error': format_exc()}
    return {'ds_id': ds_id, 'type': type_, **result}


def extract_job_diagnostics(
    ds_id: str,
    job_id: int,
    fdr_bundle: FdrDiagnosticBundle,
):
    sanity_check_fdr_diagnostics(fdr_bundle)

    def fdr_diagnostic():
        images = [
            save_diagnostic_image(ds_id, df, key=key, fmt=DiagnosticImageFormat.PARQUET)
            for key, df in [
                (DiagnosticImageKey.DECOY_MAP_DF, fdr_bundle['decoy_map_df']),
                (DiagnosticImageKey.FORMULA_MAP_DF, fdr_bundle['formula_map_df']),
                (DiagnosticImageKey.METRICS_DF, fdr_bundle['metrics_df']),
            ]
        ]
        return {
            'job_id': job_id,
            'images': images,
            'data': {'decoy_sample_size': fdr_bundle['decoy_sample_size']},
        }

    return [_run_diagnostic_fn(ds_id, DiagnosticType.FDR_RESULTS, fdr_diagnostic)]


def extract_dataset_diagnostics(
    ds_id: str,
    imzml_reader: ImzMLReader,
):
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

    logger.debug(f'Extracting dataset diagnostics for {ds_id}')

    return [
        _run_diagnostic_fn(ds_id, DiagnosticType.IMZML_METADATA, metadata_diagnostic),
        _run_diagnostic_fn(ds_id, DiagnosticType.TIC, tic_diagnostic),
    ]


def sanity_check_fdr_diagnostics(fdr_bundle: FdrDiagnosticBundle) -> None:
    """Ensure FdrDiagnostics is in the expected format, because this would be a nightmare to
    debug later if invalid data is saved"""
    decoy_map_df = fdr_bundle['decoy_map_df']
    formula_map_df = fdr_bundle['formula_map_df']
    metrics_df = fdr_bundle['metrics_df']

    decoy_map_df_cols = ['formula', 'tm', 'dm']
    formula_map_df_cols = ['formula', 'modifier', 'formula_i']
    metrics_df_cols = ['chaos', 'spectral', 'spatial', 'msm']

    assert set(decoy_map_df.columns) == set(
        decoy_map_df_cols
    ), f'Unexpected columns in decoy_map_df: {decoy_map_df.columns}'

    assert set(formula_map_df.columns) == set(
        formula_map_df_cols
    ), f'Unexpected columns in formula_map_df: {formula_map_df.columns}'

    assert metrics_df.index.name == 'formula_i', 'metrics_df.index.name != formula_i'
    assert metrics_df.index.is_unique, 'metrics_df.index is not unique'
    assert all(
        col in metrics_df.columns for col in metrics_df_cols
    ), f'Unexpected columns in metrics_df: {metrics_df.columns}'
