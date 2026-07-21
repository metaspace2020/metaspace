"""Shared, ROI-agnostic accessors for dataset-level imzML browser data and diagnostics.

These load generic imaging data for a dataset (ppm, peak arrays, TIC image) and have
no ROI or segmentation semantics. Both ``DiffROIData`` (sm/rest) and
``SegmentationDataLoader`` (sm/engine/postprocessing) use them via dependency injection:
the caller owns the ``db`` / ``s3_client`` / ``image_storage`` clients and passes them in.
"""

from io import BytesIO

import numpy as np


def get_ppm(db, ds_id):
    ppm = db.select_one(
        "SELECT config->'image_generation'->>'ppm' FROM dataset WHERE id = %s",
        params=(ds_id,),
    )
    return int(ppm[0])


def get_imzml_browser_dataset(db, s3_client, sm_config, ds_id):
    res = db.select_one('SELECT input_path FROM dataset WHERE id = %s', params=(ds_id,))

    uuid = res[0].split('/')[-1]
    browser_bucket = sm_config['imzml_browser_storage']['bucket']

    keys_path = {
        'mzs': f'{uuid}/mzs.npy',
        'ints': f'{uuid}/ints.npy',
        'sp_idxs': f'{uuid}/sp_idxs.npy',
    }

    result = {}
    for key_name, mz_index_key in keys_path.items():
        s3_object = s3_client.get_object(Bucket=browser_bucket, Key=mz_index_key)
        bytestream = s3_object['Body'].read()
        result[key_name] = np.frombuffer(bytestream, dtype='f')

    peak_array = np.stack([result['mzs'], result['ints'], result['sp_idxs']]).T
    return peak_array


def get_tic_image(db, image_storage, ds_id):
    query = '''
        SELECT images
        FROM dataset_diagnostic
        WHERE ds_id = %s AND type = 'TIC'
    '''
    result = db.select(query, params=(ds_id,))
    tic_image_id = result[0][0][0]['image_id']
    img_bytes = image_storage.get_image(image_storage.DIAG, ds_id, tic_image_id)
    img_bytes = BytesIO(img_bytes)
    img_bytes.seek(0)
    tic = np.load(img_bytes, allow_pickle=False)
    return tic
