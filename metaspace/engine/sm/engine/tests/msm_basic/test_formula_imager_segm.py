import numpy as np

from sm.engine.msm_basic.formula_imager_segm import gen_iso_images


def test_gen_iso_images():
    sp_inds = np.arange(10)

    gen = gen_iso_images(sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols)