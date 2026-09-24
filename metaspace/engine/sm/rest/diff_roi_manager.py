from io import BytesIO
import logging
import json

import numpy as np
from PIL import Image, ImageDraw
import pandas as pd  # pylint: disable=import-error

from sm.engine.image_storage import ImageStorage
from sm.engine.config import SMConfig
from sm.engine.storage import get_s3_client
from sm.engine.utils.browser_arrays import STREAM_CHUNK_BYTES, browser_arrays_for_dataset
from sm.engine.utils.dataset_image_data import get_ppm, get_tic_image
from sm.engine.utils.ion_images import iter_ion_image_chunks, postprocess_ion_image_chunk

logger = logging.getLogger(__name__)


def precompute_roi_info(roi_masks):
    """Per-ROI in/out masks; "out" is the union of the other ROIs, never the background."""
    roi_masks_flat = {roi_id: mask.ravel().astype(bool) for roi_id, mask in roi_masks.items()}
    valid_mask = np.zeros_like(list(roi_masks_flat.values())[0], dtype=bool)
    for mask in roi_masks_flat.values():
        valid_mask |= mask

    roi_info = {}
    for roi_id, in_mask in roi_masks_flat.items():
        out_mask = valid_mask & ~in_mask
        roi_info[roi_id] = {
            'in_mask_f': in_mask.astype(np.float32),
            'out_mask_f': out_mask.astype(np.float32),
            'n_in': in_mask.sum(),
            'n_out': out_mask.sum(),
            'in_idx': np.where(in_mask)[0],
            'out_idx': np.where(out_mask)[0],
        }
    return roi_info


def _compute_chunk_metrics(chunk_data, roi_info, results, row_ann):
    """log2FC and AUC for the rows of ``chunk_data``; ``row_ann`` maps row -> annotation."""
    ln_to_log2 = 1 / np.log(2)
    for roi_id, info in roi_info.items():
        mean_in = (chunk_data @ info['in_mask_f']) / info['n_in']
        mean_out = (chunk_data @ info['out_mask_f']) / info['n_out']
        log2fc = (mean_in - mean_out) * ln_to_log2
        auc = (chunk_data[:, info['in_samples']] > chunk_data[:, info['out_samples']]).mean(axis=1)
        results[roi_id]['log2fc'][row_ann] = log2fc.astype(np.float32)
        results[roi_id]['auc'][row_ann] = auc.astype(np.float32)


def compute_roi_metrics(  # pylint: disable=too-many-arguments, too-many-locals
    arrays,
    mz_lo: np.ndarray,
    mz_hi: np.ndarray,
    chunk_bytes: int,
    n_pixels: int,
    rows: int,
    roi_info: dict,
    tic_flat: np.ndarray,
    tic_nonzero: np.ndarray,
    hotspot_percentile: int,
    tic_normalize: bool,
    log_transform_tic: bool,
):
    """Score annotations in index order, ``rows`` at a time, reading only their m/z windows.

    Each group's windows are fetched with coalesced range reads (``arrays.iter_mz_windows``)
    into one ``(rows, n_pixels)`` float32 buffer, which is post-processed and scored before
    the next group is read. Peak memory is that buffer plus its partition scratch, whatever
    the number of annotations. Grouping consecutive annotations ``rows`` at a time is the
    same grouping the pre-streaming implementation used, which keeps the float32 ROI means
    bit-identical for the same ``rows``.
    """
    n_ann = len(mz_lo)
    results = {
        roi_id: {
            'log2fc': np.empty(n_ann, dtype=np.float32),
            'auc': np.empty(n_ann, dtype=np.float32),
        }
        for roi_id in roi_info
    }
    chunks = iter_ion_image_chunks(arrays, mz_lo, mz_hi, chunk_bytes, n_pixels, rows)
    for group_start, group_end, chunk in chunks:
        postprocess_ion_image_chunk(
            chunk, tic_flat, tic_nonzero, hotspot_percentile, tic_normalize, log_transform_tic
        )
        _compute_chunk_metrics(chunk, roi_info, results, np.arange(group_start, group_end))
    return results


class DiffROIData:
    """Class for differential ROI analysis results storage and retrieval."""

    def __init__(
        self,
        ds_id: str,
        db,
        hotspot_percentile: int = 99,
        tic_normalize: bool = True,
        log_transform_tic: bool = True,
    ):
        self.ds_id = ds_id
        self._db = db
        self._sm_config = SMConfig.get_conf()
        self.s3_client = get_s3_client(sm_config=self._sm_config)
        self._image_storage = ImageStorage(self._sm_config)
        self.hotspot_percentile = hotspot_percentile
        self.tic_normalize = tic_normalize
        self.log_transform_tic = log_transform_tic

    def get_dataset_roi(self):
        """Get all ROI GeoJSON data for this dataset from the roi table."""
        query = '''
            SELECT id, name, geojson
            FROM roi
            WHERE dataset_id = %s
        '''
        roi_results = self._db.select(query, params=(self.ds_id,))

        if not roi_results:
            return None

        # Convert to the expected GeoJSON FeatureCollection format
        features = []
        for roi_id, roi_name, geojson_data in roi_results:
            # If geojson_data is already a dict, use it directly
            # If it's a string, parse it
            if isinstance(geojson_data, str):
                geojson_data = json.loads(geojson_data)

            # Each ROI row contains a single feature, add id and name to properties
            if 'properties' not in geojson_data:
                geojson_data['properties'] = {}
            geojson_data['properties']['id'] = roi_id
            geojson_data['properties']['name'] = roi_name
            features.append(geojson_data)

        return {'type': 'FeatureCollection', 'features': features}

    def get_annots_ids(self):
        query = '''
            SELECT
                a.id, a.formula, a.adduct,
                a.job_id, j.moldb_id
            FROM annotation a
            JOIN job j ON a.job_id = j.id
            WHERE j.ds_id = %s
        '''
        annot_res = self._db.select(query, params=(self.ds_id,))
        annot_df = pd.DataFrame(
            annot_res, columns=['annotation_id', 'formula', 'adduct', 'job_id', 'moldb_id']
        )
        return annot_df

    def get_annots_with_metrics(self):
        query = '''
            SELECT images
            FROM dataset_diagnostic
            WHERE ds_id = %s AND type = 'FDR_RESULTS'
        '''
        result = self._db.select(query, params=(self.ds_id,))

        per_db_metrics = []
        for db_res in result:
            decoy_map_img_id = db_res[0][0]['image_id']
            formula_map_img_id = db_res[0][1]['image_id']
            metrics_df_img_id = db_res[0][2]['image_id']

            decoy_map = self._image_storage.get_image(
                self._image_storage.DIAG, self.ds_id, decoy_map_img_id
            )
            sf_map = self._image_storage.get_image(
                self._image_storage.DIAG, self.ds_id, formula_map_img_id
            )
            metrics_df_bytes = self._image_storage.get_image(
                self._image_storage.DIAG, self.ds_id, metrics_df_img_id
            )

            decoy_map = pd.read_parquet(BytesIO(decoy_map))
            sf_map = pd.read_parquet(BytesIO(sf_map))
            metrics_df = pd.read_parquet(BytesIO(metrics_df_bytes))

            sf_map = sf_map[sf_map['modifier'].isin(decoy_map.tm)]
            metrics_df = metrics_df[metrics_df.index.isin(sf_map['formula_i'])]

            merged_df = metrics_df.merge(sf_map, how='left', left_index=True, right_on='formula_i')
            per_db_metrics.append(merged_df)

        if not per_db_metrics:
            # No FDR_RESULTS found for this dataset
            return pd.DataFrame()

        all_metrics_df = pd.concat(per_db_metrics, ignore_index=True)
        all_metrics_df = all_metrics_df.drop_duplicates(subset=['formula', 'modifier'])

        monoiso_theo_mz = [i[0] for i in all_metrics_df.theo_mz]
        all_metrics_df['monoiso_theo_mz'] = monoiso_theo_mz
        return all_metrics_df

    def prepare_data_for_diff_analysis(self):
        """Prepare lookup data for the streaming differential analysis (no peak arrays)."""

        def create_roi_masks(geojson, width, height):
            roi_masks = {}

            for feature in geojson['features']:
                roi_id = feature['properties']['id']

                mask = Image.new('L', (width, height), 0)
                draw = ImageDraw.Draw(mask)
                coords = feature['properties']['coordinates']
                draw.polygon([(coord['x'], coord['y']) for coord in coords], fill=1)
                roi_masks[roi_id] = np.array(mask)

            return roi_masks

        annots_df = self.get_annots_with_metrics()
        if annots_df.empty:
            raise ValueError(f"No annotations found for dataset {self.ds_id}")

        ppm = get_ppm(self._db, self.ds_id)
        theo_mzs = annots_df['monoiso_theo_mz'].values.astype(np.float64)
        factor = theo_mzs * ppm * 1e-6

        tic_image = get_tic_image(self._db, self._image_storage, self.ds_id)
        height, width = tic_image.shape
        n_pixels = height * width

        tic_flat = tic_image.ravel()
        tic_nonzero = tic_flat > 0

        roi_geojson = self.get_dataset_roi()
        if roi_geojson is None:
            raise ValueError(f"No ROI found for dataset {self.ds_id}")

        roi_masks = create_roi_masks(roi_geojson, width, height)

        return {
            'mz_lo': theo_mzs - factor,
            'mz_hi': theo_mzs + factor,
            'n_pixels': n_pixels,
            'formulas': annots_df['formula'].values,
            'modifiers': annots_df['modifier'].values,
            'tic_flat': tic_flat,
            'tic_nonzero': tic_nonzero,
            'roi_masks': roi_masks,
            'hotspot_percentile': self.hotspot_percentile,
            'tic_normalize': self.tic_normalize,
            'log_transform_tic': self.log_transform_tic,
        }

    def browser_arrays(self):
        return browser_arrays_for_dataset(self._db, self.s3_client, self._sm_config, self.ds_id)

    def save_diff_roi_results(self, diff_roi_df: pd.DataFrame):
        """Insert diff ROI results into the diff_roi table."""
        annot_map = self.get_annots_ids()

        merged = diff_roi_df.merge(
            annot_map[['annotation_id', 'formula', 'adduct']], on=['formula', 'adduct'], how='left'
        )
        merged = merged.dropna(subset=['annotation_id'])

        # All ROIs now have roi_id (either real IDs or legacy_X IDs)
        rows = list(
            zip(
                merged['annotation_id'].astype(int),
                merged['roi_id'].astype(int),
                merged['log2fc'],
                merged['auc'],
            )
        )

        if rows:
            self._db.insert(
                'INSERT INTO diff_roi '
                '(annotation_id, roi_id, lfc, auc) '
                'VALUES (%s, %s, %s, %s) '
                'ON CONFLICT (annotation_id, roi_id) '
                'DO UPDATE SET lfc = EXCLUDED.lfc, '
                'auc = EXCLUDED.auc',
                rows=rows,
            )


class DiffROIManager:
    """Class for managing differential ROI analysis operations."""

    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()

    def run_diff_roi(  # pylint: disable=too-many-arguments, too-many-locals
        self,
        ds_id,
        hotspot_percentile: int = 99,
        tic_normalize: bool = True,
        log_transform_tic: bool = True,
        chunk_size=100,
        n_pixel_samples=10000,
    ):
        """Run differential ROI analysis by streaming the annotation m/z windows,
        ``chunk_size`` ion images at a time."""
        data = DiffROIData(ds_id, self._db, hotspot_percentile, tic_normalize, log_transform_tic)
        diff_data = data.prepare_data_for_diff_analysis()
        n_pixels = diff_data['n_pixels']

        roi_info = precompute_roi_info(diff_data['roi_masks'])
        for info in roi_info.values():
            effective_samples = min(n_pixel_samples, info['n_in'] * info['n_out'])
            info['in_samples'] = np.random.choice(
                info['in_idx'], size=effective_samples, replace=True
            )
            info['out_samples'] = np.random.choice(
                info['out_idx'], size=effective_samples, replace=True
            )

        results = compute_roi_metrics(
            data.browser_arrays(),
            diff_data['mz_lo'],
            diff_data['mz_hi'],
            chunk_bytes=STREAM_CHUNK_BYTES,
            n_pixels=n_pixels,
            rows=int(chunk_size),
            roi_info=roi_info,
            tic_flat=diff_data['tic_flat'],
            tic_nonzero=diff_data['tic_nonzero'],
            hotspot_percentile=diff_data['hotspot_percentile'],
            tic_normalize=diff_data['tic_normalize'],
            log_transform_tic=diff_data['log_transform_tic'],
        )

        # Build flat results table
        annot_cols = pd.DataFrame(
            {
                'formula': diff_data['formulas'],
                'adduct': diff_data['modifiers'],
            }
        )
        dfs = []
        for roi_id, metrics in results.items():
            roi_df = annot_cols.copy()
            roi_df['roi_id'] = roi_id
            roi_df['log2fc'] = metrics['log2fc']
            roi_df['auc'] = metrics['auc']
            dfs.append(roi_df)

        return pd.concat(dfs, ignore_index=True)

    def save_diff_roi_results(self, ds_id, diff_roi_df):
        """Save differential ROI results to the database."""
        data = DiffROIData(ds_id, self._db)
        data.save_diff_roi_results(diff_roi_df)
