import numpy as np
from sm.engine.dataset import Dataset
from sm.engine.formulas import Formulas
from mock import MagicMock
from numpy.testing import assert_array_almost_equal

from sm.engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
from sm.engine.tests.util import spark_context


def test_sample_spectra_2by3(spark_context):
    ds = MagicMock(spec=Dataset)
    ds.get_spectra.return_value = spark_context.parallelize([(0, np.array([100.0]), np.array([0, 100.0])),
                                                             (1, np.array([100.0]), np.array([0, 100.0])),
                                                             (2, np.array([50.0]), np.array([0, 100.0])),
                                                             (3, np.array([200.0]), np.array([0, 100.0])),
                                                             (4, np.array([200.0]), np.array([0, 100.0]))])

    formulas = MagicMock(spec=Formulas)
    formulas.get_sf_peak_bounds.return_value = np.array([100 - 0.01, 200 - 0.01]), np.array([100 + 0.01, 200 + 0.01])
    formulas.get_sf_peak_map.return_value = np.array([(0, j) for j in [0, 1]])

    ss = sample_spectra(spark_context, ds, formulas).collect()

    assert_array_almost_equal(ss, [((0, 0), (0, 100.0)), ((0, 0), (1, 100.0)),
                                   ((0, 1), (3, 100.0)), ((0, 1), (4, 100.0))])


def test_compute_sf_peak_images_2by3(spark_context):
    ds = MagicMock(spec=Dataset)
    ds.get_dims.return_value = (2, 3)
    ds.get_norm_img_pixel_inds.return_value = np.array([1, 2, 3, 4, 5])

    sf_sp_intens = spark_context.parallelize([((0, 0), (0, 100.0)), ((0, 0), (1, 100.0)),
                                              ((0, 1), (3, 100.0)), ((0, 1), (4, 100.0))])

    sf_p_imgs = compute_sf_peak_images(ds, sf_sp_intens).collect()

    assert_array_almost_equal(sf_p_imgs[0][1][1].toarray(), np.array([[0, 100, 100], [0, 0, 0]]))
    assert_array_almost_equal(sf_p_imgs[1][1][1].toarray(), np.array([[0, 0, 0], [0, 100, 100]]))


def test_compute_sf_images_2by3(spark_context):
    sf_peak_imgs = spark_context.parallelize([(0, (0, np.array([[0, 100, 100], [0, 0, 0]]))),
                                              (0, (1, np.array([[0, 0, 0], [0, 100, 100]])))])

    sf_imgs = compute_sf_images(sf_peak_imgs).collect()

    assert sf_imgs[0][0] == 0
    assert_array_almost_equal(sf_imgs[0][1], [[[0, 100, 100], [0, 0, 0]],
                                              [[0, 0, 0], [0, 100, 100]]])
