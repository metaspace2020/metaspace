from __future__ import annotations

import logging
from io import BytesIO
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

from sm.engine import molecular_db
from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.formula_parser import format_ion_formula
from sm.engine.storage import get_s3_resource
from sm.rest.diff_roi_manager import DiffROIData

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
      AND m.fdr <= %s
      AND m.iso_image_ids[1] IS NOT NULL
      AND (m.stats->'theo_mz'->>0) IS NOT NULL
'''


# ---------------------------------------------------------------------------
# SegmentationDataLoader
# ---------------------------------------------------------------------------

class SegmentationDataLoader:

    def __init__(self, ds_id: str, db: DB, sm_config: Optional[Dict] = None):
        self.ds_id = ds_id
        self._db = db
        self._sm_config = sm_config or SMConfig.get_conf()
        self._roi_data = DiffROIData(ds_id, db)

    # ------------------------------------------------------------------
    # Annotation filtering
    # ------------------------------------------------------------------

    def _get_filtered_annotations(
        self,
        databases: List[Union[Tuple[str, str], List[str]]],
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

        for db_pair in databases:
            name, version = db_pair
            moldb_id = molecular_db.find_by_name_version(name, version).id

            rows = self._db.select_with_fields(
                ANNOTATIONS_SEL, (self.ds_id, moldb_id, self.ds_id, moldb_id, fdr)
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
                        f'annotations for {name}-{version}. Retrying without off-sample filter.'
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

    # ------------------------------------------------------------------
    # Ion image construction (mirrors DiffROIManager.build_ion_images_chunk
    # without log transform)
    # ------------------------------------------------------------------

    @staticmethod
    def build_ion_images_chunk(
        lefts: np.ndarray,
        rights: np.ndarray,
        ints: np.ndarray,
        sp_idxs: np.ndarray,
        n_pixels: int,
        chunk_start: int,
        chunk_end: int,
        tic_flat: Optional[np.ndarray] = None,
        tic_nonzero: Optional[np.ndarray] = None,
        hotspot_percentile: int = 99,
        tic_normalize: bool = True,
    ) -> np.ndarray:
        """Build a chunk of ion images from raw spectral data and TIC-normalise.

        Matches DiffROIManager.build_ion_images_chunk without the log transform,
        which is not appropriate for segmentation inputs.

        Returns
        -------
        np.ndarray, shape (chunk_end - chunk_start, n_pixels), float32
        """
        size = chunk_end - chunk_start
        chunk = np.zeros((size, n_pixels), dtype=np.float32)

        for i in range(size):
            low = lefts[chunk_start + i]
            high = rights[chunk_start + i]
            if low < high:
                chunk[i] = np.bincount(
                    sp_idxs[low:high], weights=ints[low:high], minlength=n_pixels
                )

        # Hotspot clipping
        k = int(n_pixels * hotspot_percentile / 100)
        partitioned = np.partition(chunk, k, axis=1)
        thresholds = partitioned[:, k : k + 1]
        del partitioned
        thresholds = np.where(thresholds > 0, thresholds, chunk.max(axis=1)[:, np.newaxis])
        np.minimum(chunk, thresholds, out=chunk)

        # TIC normalisation (no log transform)
        if tic_normalize and tic_flat is not None and tic_nonzero is not None:
            chunk[:, tic_nonzero] /= tic_flat[tic_nonzero]
            chunk[:, ~tic_nonzero] = 0

        return chunk

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def prepare_segmentation_input(
        self,
        databases: List[Union[Tuple[str, str], List[str]]],
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
            databases, fdr, adducts, off_sample, min_mz, max_mz
        )
        logger.info(
            f'Dataset {self.ds_id}: _get_filtered_annotations returned {len(annotations)} rows '
            f'(databases={databases}, fdr={fdr}, off_sample={off_sample})'
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
                f'{databases} at fdr={fdr}'
            )

        # 2. Shared data — reuse DiffROIData methods
        peak_array = self._roi_data.get_imzml_browser_dataset()
        ppm = self._roi_data.get_ppm()
        tic_image = self._roi_data.get_tic_image()

        mzs = peak_array[:, 0]
        ints = peak_array[:, 1]
        sp_idxs = peak_array[:, 2].astype(np.int32)

        height, width = tic_image.shape
        n_pixels = height * width
        tic_flat = tic_image.ravel()
        tic_nonzero = tic_flat > 0

        # 3. Per-annotation mz search bounds (mirrors precompute_mz_bounds in DiffROIData)
        theo_mzs = np.array([r['theo_mz'] for r in annotations], dtype=np.float64)
        factor = theo_mzs * ppm * 1e-6
        lefts = np.searchsorted(mzs, theo_mzs - factor, side='left')
        rights = np.searchsorted(mzs, theo_mzs + factor, side='right')

        n_ann = len(annotations)

        # 4. Build full intensity matrix (n_ann, n_pixels) in chunks
        intensity_full = np.empty((n_ann, n_pixels), dtype=np.float32)
        for chunk_start in range(0, n_ann, chunk_size):
            chunk_end = min(chunk_start + chunk_size, n_ann)
            intensity_full[chunk_start:chunk_end] = self.build_ion_images_chunk(
                lefts, rights, ints, sp_idxs, n_pixels,
                chunk_start, chunk_end,
                tic_flat=tic_flat,
                tic_nonzero=tic_nonzero,
            )

        # 5. Apply foreground mask → (n_foreground, n_ann)
        foreground_mask = tic_flat > 0
        intensity_matrix = intensity_full[:, foreground_mask].T

        pixel_indices = np.where(foreground_mask)[0]
        pixel_coordinates = np.column_stack(
            [pixel_indices % width, pixel_indices // width]
        ).astype(np.int32)

        ion_labels_out = np.array([r['_label'] for r in annotations])
        image_shape = np.array([width, height], dtype=np.int32)

        logger.info(
            f'Dataset {self.ds_id}: segmentation input ready — '
            f'{intensity_matrix.shape[0]} foreground pixels × {n_ann} ions, '
            f'image shape ({width}, {height})'
        )

        # 6. Serialise and upload to S3
        res = self._db.select_one('SELECT input_path FROM dataset WHERE id = %s', params=(self.ds_id,))
        uuid = res[0].split('/')[-1]
        bucket_name = self._sm_config['imzml_browser_storage']['bucket']
        s3_key = f'{uuid}/segmentation_input.npz'

        buf = BytesIO()
        np.savez_compressed(
            buf,
            intensity_matrix=intensity_matrix,
            pixel_coordinates=pixel_coordinates,
            ion_labels=ion_labels_out,
            image_shape=image_shape,
        )
        buf.seek(0)

        get_s3_resource(self._sm_config).Bucket(bucket_name).put_object(
            Key=s3_key, Body=buf.read()
        )

        logger.info(f'Dataset {self.ds_id}: saved → s3://{bucket_name}/{s3_key}')
        return s3_key
