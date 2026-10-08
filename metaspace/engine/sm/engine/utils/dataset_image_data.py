"""Shared, ROI-agnostic accessors for dataset-level diagnostics (ppm, TIC image).

Peak data is never loaded whole any more: consumers stream the m/z-sorted browser arrays
through ``sm.engine.utils.browser_arrays`` or read a region's spectra from the ``.ibd``
through ``sm.engine.utils.pixel_spectra``. Both ``DiffROIData`` (sm/rest) and
``SegmentationDataLoader`` (sm/engine/postprocessing) use these accessors via dependency
injection: the caller owns the ``db`` / ``image_storage`` clients and passes them in.
"""

from io import BytesIO

import numpy as np


def get_ppm(db, ds_id):
    ppm = db.select_one(
        "SELECT config->'image_generation'->>'ppm' FROM dataset WHERE id = %s",
        params=(ds_id,),
    )
    return int(ppm[0])


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
