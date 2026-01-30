import numpy as np
import pandas as pd
from io import BytesIO
from PIL import Image, ImageDraw
#from utils import PROFILE_RESULTS, log_time_and_catch


from sm.engine.db import ConnectionPool, DB
from sm.engine.image_storage import ImageStorage
from sm.engine.config import SMConfig
from sm.engine.storage import get_s3_client

#SMConfig.set_path('/opt/dev/metaspace/metaspace/engine/conf/config.json')
config = SMConfig.get_conf()
image_storage = ImageStorage(config)

def get_dataset_roi(ds_id: str):
    """Fetch ROI GeoJSON from database.

    Args:
        ds_id (str): Dataset ID.

    Returns:
        dict or None: ROI GeoJSON if found, else None.
    """
    with ConnectionPool(config['db']):
        result = DB().select_one('SELECT roi FROM dataset WHERE id = %s', params=(ds_id,))

        if result and result[0]:
            roi_json = result[0]
            return roi_json

    return None

def get_ppm(ds_id: str) -> int:
    with ConnectionPool(config['db']):
        ppm = DB().select_one("SELECT config->'image_generation'->>'ppm' FROM dataset WHERE id = %s",params=(ds_id,))
    ppm = int(ppm[0])
    return ppm

def get_annots_with_metrics(ds_id: str):
    query = '''
                SELECT images
                FROM dataset_diagnostic
                WHERE ds_id = %s AND type = 'FDR_RESULTS'
            '''
    with ConnectionPool(config['db']):
        result = DB().select(query, params=(ds_id,))

    per_db_metrics = []
    for db_res in result:
        decoy_map_img_id = db_res[0][0]['image_id']
        formula_map_img_id = db_res[0][1]['image_id']
        metrics_df_img_id = db_res[0][2]['image_id']

        decoy_map = image_storage.get_image(image_storage.DIAG, ds_id, decoy_map_img_id)
        sf_map = image_storage.get_image(image_storage.DIAG, ds_id, formula_map_img_id)
        metrics_df_bytes = image_storage.get_image(image_storage.DIAG, ds_id, metrics_df_img_id)

        decoy_map = pd.read_parquet(BytesIO(decoy_map))
        sf_map = pd.read_parquet(BytesIO(sf_map))
        metrics_df = pd.read_parquet(BytesIO(metrics_df_bytes))

        sf_map = sf_map[sf_map['modifier'].isin(decoy_map.tm)]
        metrics_df = metrics_df[metrics_df.index.isin(sf_map['formula_i'])]

        merged_df = metrics_df.merge(sf_map, how = 'left', left_index=True, right_on='formula_i')
        per_db_metrics.append(merged_df)
    all_metrics_df = pd.concat(per_db_metrics, ignore_index=True)
    all_metrics_df = all_metrics_df.drop_duplicates(subset=['formula', 'modifier'])

    monoiso_theo_mz = [i[0] for i in all_metrics_df.theo_mz]
    all_metrics_df['monoiso_theo_mz'] = monoiso_theo_mz
    return all_metrics_df

def get_imzml_browser_dataset(ds_id: str) -> np.ndarray:

    with ConnectionPool(config['db']):
        res = DB().select_one('SELECT input_path FROM dataset WHERE id = %s', params = (ds_id,))

    uuid = res[0].split('/')[-1]
    browser_bucket = config['imzml_browser_storage']['bucket']
    s3_client = get_s3_client(sm_config=config)

    keys_path = {
        'mzs': f'{uuid}/mzs.npy',
        'ints': f'{uuid}/ints.npy',
        'sp_idxs': f'{uuid}/sp_idxs.npy'
    }

    result = {}
    for key_name, mz_index_key in keys_path.items():
        s3_object = s3_client.get_object(Bucket=browser_bucket, Key=mz_index_key)
        bytestream = s3_object['Body'].read()
        result[key_name] = np.frombuffer(bytestream, dtype='f')

    peak_array = np.stack([result['mzs'], result['ints'], result['sp_idxs']]).T
    return peak_array

def precompute_mz_bounds(all_metrics_df, peak_array, ppm):
    """Pre-compute searchsorted bounds for all annotations.

    Returns small index arrays (O(K)) — no ion images allocated.
    """
    mzs = peak_array[:, 0]
    ints = peak_array[:, 1]
    sp_idxs = peak_array[:, 2].astype(np.int32)

    theo_mzs = all_metrics_df['monoiso_theo_mz'].values
    factor = theo_mzs * ppm * 1e-6
    mz_lo = theo_mzs - factor
    mz_hi = theo_mzs + factor

    lefts  = np.searchsorted(mzs, mz_lo, side='left')
    rights = np.searchsorted(mzs, mz_hi, side='right')

    return lefts, rights, ints, sp_idxs


def build_ion_images_chunk(lefts, rights, ints, sp_idxs, n_pixels,
                           chunk_start, chunk_end,
                           tic_flat=None, tic_nonzero=None,
                           hotspot_percentile=99,
                           TIC_normalize=True, log_transform_tic=True):
    """Build and post-process a chunk of ion images.

    Allocates only (chunk_size, n_pixels) — freed when the caller discards it.
    """
    chunk_size = chunk_end - chunk_start
    chunk = np.zeros((chunk_size, n_pixels), dtype=np.float32)

    for i in range(chunk_size):
        l, r = lefts[chunk_start + i], rights[chunk_start + i]
        if l < r:
            chunk[i] = np.bincount(
                sp_idxs[l:r], weights=ints[l:r], minlength=n_pixels
            )

    # --- Hotspot clipping ---
    k = int(n_pixels * hotspot_percentile / 100)
    partitioned = np.partition(chunk, k, axis=1)
    thresholds = partitioned[:, k:k+1]
    del partitioned
    maxvals = chunk.max(axis=1, keepdims=True)
    thresholds = np.where(thresholds > 0, thresholds, maxvals)
    np.minimum(chunk, thresholds, out=chunk)

    # --- TIC normalization ---
    if TIC_normalize and tic_flat is not None:
        chunk[:, tic_nonzero] /= tic_flat[tic_nonzero]
        chunk[:, ~tic_nonzero] = 0
        if log_transform_tic:
            np.log(chunk + 1e-6, out=chunk)

    return chunk

def get_TIC_image(ds_id: str) -> np.ndarray:
    query = '''
                SELECT images
                FROM dataset_diagnostic
                WHERE ds_id = %s AND type = 'TIC'
            '''
    with ConnectionPool(config['db']):
        result = DB().select(query, params=(ds_id,))
    TIC_image_id = result[0][0][0]['image_id']
    img_bytes = image_storage.get_image(image_storage.DIAG, ds_id, TIC_image_id)
    img_bytes = BytesIO(img_bytes)
    img_bytes.seek(0)
    tic = np.load(img_bytes, allow_pickle=False)
    return tic

def create_roi_masks(geojson, width, height):
    roi_masks = {}

    for feature in geojson['features']:
        roi_name = feature['properties']['name']
        mask = Image.new('L', (width, height), 0)
        draw = ImageDraw.Draw(mask)
        coords = feature['geometry']['coordinates']
        draw.polygon([tuple(pt) for pt in coords], fill=1)
        roi_masks[roi_name] = np.array(mask)


    return roi_masks

def prepare_data_for_diff_analysis(ds_id: str,
                                   hotspot_percentile: int = 99,
                                   TIC_normalize: bool = True,
                                   log_transform_tic: bool = True):
    """Prepare lookup data for chunked differential analysis.

    Returns pre-computed search bounds and normalization data — no ion images
    are allocated. The caller builds chunks via build_ion_images_chunk().
    """

    annots_df = get_annots_with_metrics(ds_id)
    if annots_df.empty:
        raise ValueError(f"No annotations found for dataset {ds_id}")

    peak_arr = get_imzml_browser_dataset(ds_id)
    ppm = get_ppm(ds_id)

    tic_image = get_TIC_image(ds_id)
    height, width = tic_image.shape
    n_pixels = height * width

    lefts, rights, ints, sp_idxs = precompute_mz_bounds(annots_df, peak_arr, ppm)

    tic_flat = tic_image.ravel()
    tic_nonzero = tic_flat > 0

    roi_geojson = get_dataset_roi(ds_id)
    if roi_geojson is None:
        raise ValueError(f"No ROI found for dataset {ds_id}")

    roi_masks = create_roi_masks(roi_geojson, width, height)

    return {
        'lefts': lefts,
        'rights': rights,
        'ints': ints,
        'sp_idxs': sp_idxs,
        'n_pixels': n_pixels,
        'n_ann': len(annots_df),
        'formulas': annots_df['formula'].values,
        'modifiers': annots_df['modifier'].values,
        'tic_flat': tic_flat,
        'tic_nonzero': tic_nonzero,
        'roi_masks': roi_masks,
        'image_shape': (height, width),
        'hotspot_percentile': hotspot_percentile,
        'TIC_normalize': TIC_normalize,
        'log_transform_tic': log_transform_tic,
    }

def _precompute_roi_info(roi_masks):
    """
    Precompute ROI masks and indices.

    Parameters
    ----------
    roi_masks : dict
        {roi_name: 2D binary mask} where mask is True/1 for pixels in ROI

    Returns
    -------
    dict : {roi_name: {'in_mask_f': ..., 'out_mask_f': ..., ...}}
    """
    # Flatten all masks
    roi_masks_flat = {name: mask.ravel().astype(bool) for name, mask in roi_masks.items()}

    # Valid pixels = pixels in any ROI
    valid_mask = np.zeros_like(list(roi_masks_flat.values())[0], dtype=bool)
    for mask in roi_masks_flat.values():
        valid_mask |= mask

    roi_info = {}
    for roi_name, in_mask in roi_masks_flat.items():
        out_mask = valid_mask & ~in_mask
        roi_info[roi_name] = {
            'in_mask_f': in_mask.astype(np.float32),
            'out_mask_f': out_mask.astype(np.float32),
            'n_in': in_mask.sum(),
            'n_out': out_mask.sum(),
            'in_idx': np.where(in_mask)[0],
            'out_idx': np.where(out_mask)[0],
        }

    return roi_info


def _compute_chunk_metrics(chunk_data, roi_info, results, chunk_start, chunk_end, n_samples):
    """Compute log2FC and AUC for a chunk of annotations."""

    # Natural log to log2 conversion
    LN_TO_LOG2 = 1 / np.log(2)

    for roi_id, info in roi_info.items():
        # Log2FC (difference of means for log-transformed data)
        mean_in = (chunk_data @ info['in_mask_f']) / info['n_in']
        mean_out = (chunk_data @ info['out_mask_f']) / info['n_out']
        log2fc = (mean_in - mean_out) * LN_TO_LOG2

        # AUC (sampled)

        in_samples = info['in_samples']
        out_samples = info['out_samples']
        auc = (chunk_data[:, in_samples] > chunk_data[:, out_samples]).mean(axis=1)

        # Store
        results[roi_id]['log2fc'][chunk_start:chunk_end] = log2fc.astype(np.float32)
        results[roi_id]['auc'][chunk_start:chunk_end] = auc.astype(np.float32)


def run_diff_roi(
    ds_id: str,
    hotspot_percentile: int = 99,
    TIC_normalize: bool = True,
    log_transform_tic: bool = True,
    chunk_size=100,
    n_pixel_samples=10000
):

    diff_data = prepare_data_for_diff_analysis(ds_id,
                                                hotspot_percentile=hotspot_percentile,
                                                TIC_normalize=TIC_normalize,
                                                log_transform_tic=log_transform_tic)

    n_ann = diff_data['n_ann']

    # Precompute ROI info
    roi_info = _precompute_roi_info(diff_data['roi_masks'])
    for info in roi_info.values():
        effective_samples = min(n_pixel_samples, info['n_in'] * info['n_out'])
        info['in_samples'] = np.random.choice(info['in_idx'], size=effective_samples, replace=True)
        info['out_samples'] = np.random.choice(info['out_idx'], size=effective_samples, replace=True)

    # Preallocate results
    results = {
        roi_id: {
            'log2fc': np.empty(n_ann, dtype=np.float32),
            'auc': np.empty(n_ann, dtype=np.float32),
        }
        for roi_id in roi_info
    }

    # Build + compute in chunks — only (chunk_size, n_pixels) resident at a time
    for chunk_start in range(0, n_ann, chunk_size):
        chunk_end = min(chunk_start + chunk_size, n_ann)

        chunk_data = build_ion_images_chunk(
            diff_data['lefts'], diff_data['rights'],
            diff_data['ints'], diff_data['sp_idxs'],
            diff_data['n_pixels'], chunk_start, chunk_end,
            tic_flat=diff_data['tic_flat'],
            tic_nonzero=diff_data['tic_nonzero'],
            hotspot_percentile=diff_data['hotspot_percentile'],
            TIC_normalize=diff_data['TIC_normalize'],
            log_transform_tic=diff_data['log_transform_tic'],
        )

        _compute_chunk_metrics(
            chunk_data, roi_info, results,
            chunk_start, chunk_end, n_pixel_samples
        )
        # chunk_data freed on next iteration

    # Build flat results table
    annot_cols = pd.DataFrame({
        'formula': diff_data['formulas'],
        'modifier': diff_data['modifiers'],
    })
    dfs = []
    for roi_name, metrics in results.items():
        roi_df = annot_cols.copy()
        roi_df['roi_name'] = roi_name
        roi_df['log2fc'] = metrics['log2fc']
        roi_df['auc'] = metrics['auc']
        dfs.append(roi_df)

    return pd.concat(dfs, ignore_index=True)