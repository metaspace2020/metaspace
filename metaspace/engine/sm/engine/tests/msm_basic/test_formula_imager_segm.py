from scipy.sparse import coo_matrix

from sm.engine.tests.util import pysparkling_context as spark_context
from sm.engine.msm_basic.formula_imager_segm import gen_iso_sf_images


def test_gen_iso_sf_images(spark_context):
    iso_peak_images = spark_context.parallelize([((3079, '+H'), (0, coo_matrix([[1., 0., 0.]]))),
                                                 ((3079, '+H'), (3, coo_matrix([[2., 1., 0.]]))),
                                                 ((3079, '+H'), (3, coo_matrix([[0., 0., 10.]])))])
    exp_iso_sf_imgs = [((3079, '+H'), [coo_matrix([[1., 0., 0.]]),
                                       None,
                                       None,
                                       coo_matrix([[2., 1., 0.]])])]

    iso_sf_imgs = gen_iso_sf_images(iso_peak_images, shape=(1, 3)).collect()

    assert len(iso_sf_imgs) == len(exp_iso_sf_imgs)
    for (k, l), (ek, el) in zip(iso_sf_imgs, exp_iso_sf_imgs):
        assert k == ek
        assert len(l) == len(el)
        for m, em in zip(l, el):
            if em is None:
                assert m is None
            else:
                assert (m.toarray() == em.toarray()).all()
