from __future__ import annotations

import logging
from io import BytesIO
from typing import Dict, List, Optional

import numpy as np

from sm.engine import molecular_db
from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.formula_parser import format_ion_formula
from sm.engine.image_storage import ImageStorage
from sm.engine.storage import get_s3_client, get_s3_resource
from sm.engine.utils.browser_arrays import STREAM_CHUNK_BYTES, browser_arrays_for_dataset
from sm.engine.utils.dataset_image_data import get_ppm, get_tic_image
from sm.engine.utils.ion_images import iter_ion_image_chunks, postprocess_ion_image_chunk

logger = logging.getLogger('update-daemon')

# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

ANNOTATIONS_SEL = '''
    SELECT
        m.formula,
        m.chem_mod,
        m.neutral_loss,
        m.adduct,
        (m.stats->'theo_mz'->>0)::float AS theo_mz,
        m.off_sample
    FROM annotation m
    JOIN job j ON j.id = m.job_id
    WHERE j.ds_id = %s
      AND j.moldb_id = %s
      AND j.id = (
            SELECT id FROM job
            WHERE ds_id = %s AND moldb_id = %s
            ORDER BY start DESC
            LIMIT 1
      )
      AND m.iso_image_ids[1] IS NOT NULL
      AND (m.stats->'theo_mz'->>0) IS NOT NULL
'''

# annotation.fdr is `real` (float4); cast the threshold to real so the comparison
# happens in float4 precision. Without the cast the stored 0.05 promotes to
# 0.05000000074... > 0.05::float8 and boundary (FDR == threshold) rows are dropped.
FDR_CLAUSE = '\n      AND m.fdr <= %s::real'


def fill_intensity_matrix(  # pylint: disable=too-many-arguments
    arrays,
    mz_lo: np.ndarray,
    mz_hi: np.ndarray,
    chunk_bytes: int,
    n_pixels: int,
    rows: int,
    tic_flat: np.ndarray,
    hotspot_percentile: int = 99,
) -> np.ndarray:
    """``(n_foreground_pixels, n_annotations)`` TIC-normalised intensities, built once.

    Streams ``rows`` ion images at a time and writes only the foreground pixels into the
    output, so no full-grid matrix and no second copy ever exist.
    """
    tic_nonzero = tic_flat > 0
    matrix = np.empty((int(tic_nonzero.sum()), len(mz_lo)), dtype=np.float32)
    chunks = iter_ion_image_chunks(arrays, mz_lo, mz_hi, chunk_bytes, n_pixels, rows)
    for start, end, chunk in chunks:
        postprocess_ion_image_chunk(
            chunk, tic_flat, tic_nonzero, hotspot_percentile, True, log_transform_tic=False
        )
        matrix[:, start:end] = chunk[:, tic_nonzero].T
    return matrix


# ---------------------------------------------------------------------------
# SegmentationDataLoader
# ---------------------------------------------------------------------------


class SegmentationDataLoader:
    def __init__(self, ds_id: str, db: DB, sm_config: Optional[Dict] = None):
        self.ds_id = ds_id
        self._db = db
        self._sm_config = sm_config or SMConfig.get_conf()
        self._s3_client = get_s3_client(self._sm_config)
        self._image_storage = ImageStorage(self._sm_config)

    # ------------------------------------------------------------------
    # Annotation filtering
    # ------------------------------------------------------------------

    def _get_filtered_annotations(
        self,
        database_ids: List[int],
        fdr: float,
        adducts: Optional[List[str]],
        off_sample: Optional[bool],
        min_mz: Optional[float] = None,
        max_mz: Optional[float] = None,
    ) -> List[Dict]:
        """Return deduplicated annotations filtered by database, FDR, adducts, off-sample, and mz.

        mz bounds are applied against the stored monoisotopic theo_mz.
        Deduplication is first-wins across databases.  If the off-sample filter
        produces an empty result for a database the dataset likely has no
        off-sample classification for that db, so the filter is silently dropped
        and all qualifying annotations are returned instead.
        """
        seen_labels: set = set()
        merged: List[Dict] = []
        analysis_version = self._get_analysis_version()

        for db_id in database_ids:
            moldb = molecular_db.find_by_id(db_id)

            # Targeted (small custom) databases have no meaningful FDR — annotation.fdr
            # holds placeholder values that es_export overrides with -1 so the webapp
            # shows them at every FDR level (see es_export.ESExporterBase). Mirror that
            # here: skip the FDR filter entirely instead of dropping all their rows.
            skip_fdr = moldb.targeted and analysis_version == 1

            if skip_fdr:
                rows = self._db.select_with_fields(
                    ANNOTATIONS_SEL, (self.ds_id, db_id, self.ds_id, db_id)
                )
            else:
                rows = self._db.select_with_fields(
                    ANNOTATIONS_SEL + FDR_CLAUSE, (self.ds_id, db_id, self.ds_id, db_id, fdr)
                )

            if adducts is not None:
                rows = [r for r in rows if r['adduct'] in adducts]

            if min_mz is not None:
                rows = [r for r in rows if r['theo_mz'] >= min_mz]

            if max_mz is not None:
                rows = [r for r in rows if r['theo_mz'] <= max_mz]

            if off_sample is not None:
                filtered = [r for r in rows if self._off_sample_label(r) == off_sample]
                if not filtered:
                    logger.warning(
                        f'Dataset {self.ds_id}: off_sample={off_sample} filter returned no '
                        f'annotations for {moldb.name}. Retrying without off-sample filter.'
                    )
                else:
                    rows = filtered

            for row in rows:
                label = format_ion_formula(
                    row['formula'], row['chem_mod'], row['neutral_loss'], row['adduct']
                )
                if label not in seen_labels:
                    seen_labels.add(label)
                    row['_label'] = label
                    merged.append(row)

        return merged

    @staticmethod
    def _off_sample_label(row: Dict) -> Optional[bool]:
        offsample = row.get('off_sample')
        return None if offsample is None else offsample.get('label')

    def _get_analysis_version(self) -> int:
        """Dataset analysis_version (defaults to 1). FDR handling for targeted
        databases only differs from the standard pipeline at analysis_version 1."""
        res = self._db.select_one(
            "SELECT (config->>'analysis_version')::int FROM dataset WHERE id = %s",
            params=(self.ds_id,),
        )
        if res and res[0] is not None:
            return res[0]
        return 1

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def prepare_segmentation_input(  # pylint: disable=too-many-locals, too-many-arguments
        self,
        database_ids: List[int],
        fdr: float = 0.1,
        adducts: Optional[List[str]] = None,
        ion_labels: Optional[List[str]] = None,
        off_sample: Optional[bool] = False,
        min_mz: Optional[float] = None,
        max_mz: Optional[float] = None,
        chunk_size: int = 100,
    ) -> str:
        """Build segmentation input arrays and upload as .npz to S3.

        Follows the DiffROIManager pipeline without ROI logic:
        raw spectra → hotspot clip → TIC normalise → foreground mask.

        Args:
            databases:   List of (name, version) pairs, e.g. [("HMDB", "v4")].
            fdr:         Maximum FDR threshold (inclusive).
            adducts:     Optional adduct allow-list, e.g. ["+H", "+Na"].
            ion_labels:  Optional explicit ion label allow-list (post-fetch filter).
            off_sample:  False = on-sample only (default), True = off-sample only,
                         None = no filter.
            min_mz:      Optional lower m/z bound applied against theo_mz.
            max_mz:      Optional upper m/z bound applied against theo_mz.
            chunk_size:  Number of annotations to process per chunk.

        Returns:
            S3 key of the uploaded .npz file.
        """
        # 1. Filtered annotations
        annotations = self._get_filtered_annotations(
            database_ids, fdr, adducts, off_sample, min_mz, max_mz
        )
        logger.info(
            f'Dataset {self.ds_id}: _get_filtered_annotations returned {len(annotations)} rows '
            f'(database_ids={database_ids}, fdr={fdr}, off_sample={off_sample})'
        )

        if ion_labels is not None:
            label_set = set(ion_labels)
            missing = label_set - {r['_label'] for r in annotations}
            if missing:
                logger.warning(
                    f'Dataset {self.ds_id}: {len(missing)} requested ion labels not found'
                )
            annotations = [r for r in annotations if r['_label'] in label_set]

        if not annotations:
            raise ValueError(
                f'Dataset {self.ds_id}: no annotations found across databases '
                f'{database_ids} at fdr={fdr}'
            )

        # 2. Dataset image data (ppm, TIC image); peaks are streamed, never loaded whole
        ppm = get_ppm(self._db, self.ds_id)
        tic_image = get_tic_image(self._db, self._image_storage, self.ds_id)

        height, width = tic_image.shape
        n_pixels = height * width
        tic_flat = tic_image.ravel()
        foreground_mask = tic_flat > 0

        # 3. Per-annotation m/z windows
        theo_mzs = np.array([r['theo_mz'] for r in annotations], dtype=np.float64)
        factor = theo_mzs * ppm * 1e-6
        n_ann = len(annotations)

        # 4. Stream ion images `chunk_size` at a time straight into the foreground matrix
        arrays = browser_arrays_for_dataset(self._db, self._s3_client, self._sm_config, self.ds_id)
        intensity_matrix = fill_intensity_matrix(
            arrays,
            theo_mzs - factor,
            theo_mzs + factor,
            chunk_bytes=STREAM_CHUNK_BYTES,
            n_pixels=n_pixels,
            rows=chunk_size,
            tic_flat=tic_flat,
        )

        # 5. Pixel coordinates of the foreground
        pixel_indices = np.where(foreground_mask)[0]
        pixel_coordinates = np.column_stack([pixel_indices % width, pixel_indices // width]).astype(
            np.int32
        )

        ion_labels_out = np.array([r['_label'] for r in annotations])
        image_shape = np.array([width, height], dtype=np.int32)

        logger.info(
            f'Dataset {self.ds_id}: segmentation input ready — '
            f'{intensity_matrix.shape[0]} foreground pixels × {n_ann} ions, '
            f'image shape ({width}, {height})'
        )

        # 6. Serialise and upload to S3
        bucket_name = arrays.bucket
        s3_key = f'{arrays.uuid}/segmentation_input.npz'

        buf = BytesIO()
        np.savez_compressed(
            buf,
            intensity_matrix=intensity_matrix,
            pixel_coordinates=pixel_coordinates,
            ion_labels=ion_labels_out,
            image_shape=image_shape,
        )
        buf.seek(0)

        get_s3_resource(self._sm_config).Bucket(bucket_name).put_object(Key=s3_key, Body=buf.read())

        logger.info(f'Dataset {self.ds_id}: saved → s3://{bucket_name}/{s3_key}')
        return s3_key
