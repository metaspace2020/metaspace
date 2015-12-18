import pytest
from mock import patch, mock, MagicMock
import numpy as np
from numpy.testing import assert_array_almost_equal
from scipy.sparse import csr_matrix

from engine.formula_img_validator import filter_sf_images, get_compute_img_measures
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.test.util import spark_context, ds_config


@mock.patch('engine.formula_img_validator.isotope_pattern_match', return_value=0.95)
@mock.patch('engine.formula_img_validator.isotope_image_correlation', return_value=0.8)
@mock.patch('engine.formula_img_validator.chaos', return_value=0.99)
def test_get_compute_img_measures_pass(chaos_mock, image_corr_mock, pattern_match_mock):
    img_gen_conf = {
        'image_generation': {
            'nlevels': 30,
            'do_preprocessing': False,
            'q': 99.0
        }
    }
    empty_matrix = np.zeros((2, 3))
    compute_measures = get_compute_img_measures(empty_matrix, img_gen_conf)

    sf_iso_images = [csr_matrix([[0, 100, 100], [10, 0, 3]]),
                     csr_matrix([[0, 50, 50], [0, 20, 0]])]
    sf_intensity = [100, 10, 1]

    measures = compute_measures(sf_iso_images, sf_intensity)
    assert_array_almost_equal(measures, [0.99, 0.8, 0.95])


@pytest.fixture(scope='module')
def filter_images_params():
    ds_mock = MagicMock(spec=Dataset)
    ds_mock.get_dims.return_value = (2, 3)

    formulas_mock = MagicMock(spec=Formulas)
    formulas_mock.get_sf_peak_ints.return_value = [[100, 10, 1], [100, 10, 1]]

    sf_iso_images = [(0, [csr_matrix([[0, 100, 100], [10, 0, 3]]), csr_matrix([[0, 50, 50], [0, 20, 0]])]),
                     (1, [csr_matrix([[0, 100, 100], [10, 0, 3]]), csr_matrix([[0, 50, 50], [0, 20, 0]])])]

    return ds_mock, formulas_mock, sf_iso_images


@pytest.mark.parametrize('image_measures, mol_num', [
    ((0.999, 0.999, 0.999), 1),
    ((0.999, 0.999, 0.999), 3),
])
def test_filter_sf_images_n_mol_pass(image_measures, mol_num, spark_context, filter_images_params, ds_config):
    with patch('engine.formula_img_validator.get_compute_img_measures') as mock:
        mock.return_value = lambda *args: image_measures

        # ds_config['image_measure_thresholds'] = image_measure_thr
        ds_config['molecules_num'] = mol_num

        ds_mock, formulas_mock, ref_images = filter_images_params
        ref_images_rdd = spark_context.parallelize(ref_images)
        imgs, measures = filter_sf_images(spark_context, ds_config, ds_mock, formulas_mock, ref_images_rdd)

        assert len(imgs) == len(measures) == min(mol_num, len(ref_images))
        assert 0 in imgs
        for img_sparse, img_sparse_ref in zip(imgs[0], ref_images[0][1]):
            assert_array_almost_equal(img_sparse.toarray(), img_sparse_ref.toarray())

        assert 0 in measures
        assert_array_almost_equal(measures[0], image_measures)
