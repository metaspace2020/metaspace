from mock import patch, mock_open, mock
from numpy.testing import assert_array_equal
import pytest
from engine.dataset import Dataset


@pytest.fixture
def coord_file_content():
    return (
        '0,0,1\n'
        '1,2,2\n'
        '2,2,1\n'
        '3,0,2\n'
        '4,1,2\n')


def test_get_dims_2by3(coord_file_content):
    m = mock_open(read_data=coord_file_content)
    with patch('engine.dataset.open', m):
        ds = Dataset('', '')

        m.assert_called_once_with('')
        assert ds.get_dims() == (2, 3)


def test_get_norm_img_pixel_inds_2by3(coord_file_content):
    m = mock_open(read_data=coord_file_content)
    with patch('engine.dataset.open', m):
        ds = Dataset('', '')

        m.assert_called_once_with('')
        assert_array_equal(ds.get_norm_img_pixel_inds(), [0, 5, 2, 3, 4])
