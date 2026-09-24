from unittest.mock import MagicMock

import pytest

from sm.rest.imzml_browser_manager import DatasetFiles

UUID = 'the-uuid'
REQUIRED = ['mz_index.npy', 'mzs.npy', 'ints.npy', 'sp_idxs.npy', 'portable_spectrum_reader.pickle']


def _dataset_files(keys):
    files = DatasetFiles.__new__(DatasetFiles)
    files.uuid = UUID
    files.browser_bucket = 'browser'
    files.mz_index_key = f'{UUID}/mz_index.npy'
    files.mzs_key = f'{UUID}/mzs.npy'
    files.ints_key = f'{UUID}/ints.npy'
    files.sp_idxs_key = f'{UUID}/sp_idxs.npy'
    files.portable_spectrum_reader_key = f'{UUID}/portable_spectrum_reader.pickle'
    files.s3_client = MagicMock()
    files.s3_client.list_objects.return_value = (
        {'Contents': [{'Key': f'{UUID}/{k}'} for k in keys]} if keys else {}
    )
    return files


def test_all_five_files_present():
    assert _dataset_files(REQUIRED).check_imzml_browser_files() is True


def test_extra_files_under_the_prefix_do_not_hide_the_browser_files():
    # the segmentation prep writes segmentation_input.npz next to the browser files
    assert _dataset_files(REQUIRED + ['segmentation_input.npz']).check_imzml_browser_files() is True


@pytest.mark.parametrize('missing', REQUIRED)
def test_missing_file_means_unavailable(missing):
    keys = [k for k in REQUIRED if k != missing]
    assert _dataset_files(keys).check_imzml_browser_files() is False


def test_empty_prefix_means_unavailable():
    assert _dataset_files([]).check_imzml_browser_files() is False
