from unittest.mock import patch

import numpy as np
import pytest

from sm.rest.imzml_browser import find_brightest_pixel, find_initial_peak, _parse_optional_mz

# 3x2 grid (width 3): sp_idx 4 is (x=1, y=1)
COORDINATES = np.array([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]])


def test_find_brightest_pixel_returns_xy_of_max_intensity():
    mz_peaks = np.array([[100.0, 5.0, 0], [100.0, 50.0, 4], [100.0, 7.0, 2]])
    assert find_brightest_pixel(mz_peaks, COORDINATES) == (1, 1)


def test_find_brightest_pixel_ignores_zero_intensities():
    mz_peaks = np.array([[100.0, 0.0, 4], [100.0, 1.0, 2]])
    assert find_brightest_pixel(mz_peaks, COORDINATES) == (2, 0)


def test_find_brightest_pixel_none_when_no_signal():
    assert find_brightest_pixel(np.empty((0, 3)), COORDINATES) is None
    assert find_brightest_pixel(np.array([[100.0, 0.0, 1]]), COORDINATES) is None


def test_find_brightest_pixel_offsets_coordinates_origin():
    # coordinates not starting at 0 must not change the width calculation
    shifted = COORDINATES + 10
    mz_peaks = np.array([[100.0, 3.0, 5]])
    assert find_brightest_pixel(mz_peaks, shifted) == (2, 1)


class _FakeBrowser:
    def __init__(self, ds_id, mz_low, mz_high, df=None):  # pylint: disable=unused-argument
        self.mz_low = mz_low
        self.mz_high = mz_high
        self.coordinates = COORDINATES
        self.mz_peaks = np.array([[mz_low, 9.0, 3]])


@patch('sm.rest.imzml_browser.DatasetFiles')
@patch('sm.rest.imzml_browser.DatasetBrowser', _FakeBrowser)
def test_find_initial_peak_uses_requested_mz(ds_files_cls):
    result = find_initial_peak('ds', mz=754.5381)
    assert result == {'mz': 754.5381, 'x': 0, 'y': 1}
    ds_files_cls.return_value.read_file.assert_not_called()


@patch('sm.rest.imzml_browser.DatasetFiles')
@patch('sm.rest.imzml_browser.DatasetBrowser', _FakeBrowser)
def test_find_initial_peak_defaults_to_first_index_mz(ds_files_cls):
    ds_files_cls.return_value.read_file.return_value = np.array([200.5, 300.0], dtype='f').tobytes()
    result = find_initial_peak('ds')
    assert result['mz'] == pytest.approx(200.5)
    assert (result['x'], result['y']) == (0, 1)


class _EmptyBrowser(_FakeBrowser):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mz_peaks = np.empty((0, 3))


@patch('sm.rest.imzml_browser.DatasetFiles')
@patch('sm.rest.imzml_browser.DatasetBrowser', _EmptyBrowser)
def test_find_initial_peak_without_signal_has_no_pixel(_):
    assert find_initial_peak('ds', mz=1.0) == {'mz': 1.0, 'x': None, 'y': None}


@pytest.mark.parametrize('raw', [None, ''])
def test_parse_optional_mz_absent(raw):
    assert _parse_optional_mz(raw) is None


def test_parse_optional_mz_value():
    assert _parse_optional_mz('754.5381') == 754.5381


@pytest.mark.parametrize('raw', ['abc', '0', '-1', 'inf', 'nan'])
def test_parse_optional_mz_rejects_invalid(raw):
    with pytest.raises(ValueError):
        _parse_optional_mz(raw)
