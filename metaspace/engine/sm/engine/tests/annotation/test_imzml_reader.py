import pickle
from tempfile import TemporaryDirectory

import numpy as np
from lithops import Storage
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from tests.conftest import make_imzml_reader_mock, sm_config, executor
from tests.utils import TEST_DS_CONFIG

MOCK_COORDINATES = [(x, y, 1) for y in range(1, 4, 2) for x in range(1, 4, 2)]
MOCK_SPECTRA = [(np.arange(1, i + 1), np.full(i, i)) for i in range(1, len(MOCK_COORDINATES) + 1)]
EXPECTED_TIC = np.array(
    [
        [1 * 1, np.nan, 2 * 2],
        [np.nan, np.nan, np.nan],
        [3 * 3, np.nan, 4 * 4],
    ]
)
# All intensities in a spectrum are equal, so both RMS and median equal that intensity
EXPECTED_RMS = EXPECTED_MEDIAN = np.array(
    [
        [1, np.nan, 2],
        [np.nan, np.nan, np.nan],
        [3, np.nan, 4],
    ]
)
TIC_ACCESSION = 'MS:1000285'


def make_lithops_imzml_reader(
    storage: Storage,
    mz_precision='f',
    polarity='positive',
    ds_config=TEST_DS_CONFIG,
):
    """Create an ImzML file, upload it into storage, and return an imzml_reader for it"""
    mz_dtype = {'f': np.float32, 'd': np.float64}[mz_precision]
    with TemporaryDirectory() as tmpdir:
        with ImzMLWriter(f'{tmpdir}/test.imzML', polarity=polarity, mz_dtype=mz_dtype) as writer:
            for coords, (mzs, ints) in zip(MOCK_COORDINATES, MOCK_SPECTRA):
                writer.addSpectrum(mzs, ints, coords)

        imzml_content = open(f'{tmpdir}/test.imzML', 'rb').read()
        ibd_content = open(f'{tmpdir}/test.ibd', 'rb').read()

    imzml_cobj = storage.put_cloudobject(imzml_content)
    ibd_cobj = storage.put_cloudobject(ibd_content)
    return LithopsImzMLReader(storage, imzml_cobj, ibd_cobj)


def test_imzml_reader_tic_image_from_spectra():
    imzml_reader = make_imzml_reader_mock(coordinates=MOCK_COORDINATES, spectra=MOCK_SPECTRA)
    # Ensure all spectra have been read before getting the TIC image
    for _ in imzml_reader.iter_spectra(np.arange(4)):
        pass

    assert np.array_equal(imzml_reader.tic_image(), EXPECTED_TIC, equal_nan=True)


def test_imzml_reader_tic_image_from_metadata():
    imzml_reader = make_imzml_reader_mock(
        coordinates=MOCK_COORDINATES,
        spectra=MOCK_SPECTRA,
        spectrum_metadata_fields={TIC_ACCESSION: [0, 1, 2, 3]},
    )

    # metadata_tic intentionally matches the metadata but not the spectra
    metadata_tic = np.array(
        [
            [0, np.nan, 1],
            [np.nan, np.nan, np.nan],
            [2, np.nan, 3],
        ]
    )
    assert np.array_equal(imzml_reader.tic_image(), metadata_tic, equal_nan=True)


def test_imzml_reader_rms_and_median_images():
    imzml_reader = make_imzml_reader_mock(coordinates=MOCK_COORDINATES, spectra=MOCK_SPECTRA)
    for _ in imzml_reader.iter_spectra(np.arange(4)):
        pass

    assert np.array_equal(imzml_reader.rms_image(), EXPECTED_RMS, equal_nan=True)
    assert np.array_equal(imzml_reader.median_image(), EXPECTED_MEDIAN, equal_nan=True)


def test_imzml_reader_empty_spectra_are_zero():
    """Spectra with no non-zero peaks must produce 0, matching the TIC's semantics.
    Blank/off-tissue pixels are common, and previously left NaNs that broke the images."""
    spectra = [
        (np.array([], dtype='f'), np.array([], dtype='f')),  # no peaks at all
        (np.array([1, 2], dtype='f'), np.array([0, 0], dtype='f')),  # only zero-intensity peaks
        (np.array([1, 2], dtype='f'), np.array([3, 5], dtype='f')),
        (np.array([1], dtype='f'), np.array([4], dtype='f')),
    ]
    imzml_reader = make_imzml_reader_mock(coordinates=MOCK_COORDINATES, spectra=spectra)
    for _ in imzml_reader.iter_spectra(np.arange(4)):
        pass

    expected_tic = np.array([[0, np.nan, 0], [np.nan] * 3, [8, np.nan, 4]])
    expected_rms = np.array([[0, np.nan, 0], [np.nan] * 3, [np.sqrt(17), np.nan, 4]])
    expected_median = np.array([[0, np.nan, 0], [np.nan] * 3, [4, np.nan, 4]])

    assert np.array_equal(imzml_reader.tic_image(), expected_tic, equal_nan=True)
    assert np.allclose(imzml_reader.rms_image(), expected_rms, equal_nan=True)
    assert np.array_equal(imzml_reader.median_image(), expected_median, equal_nan=True)


def test_imzml_reader_rms_with_integer_intensities():
    """imzML allows 32-bit integer intensities. Squaring those in their own dtype overflows to
    negative values, which would make the RMS NaN and fail the assertion in rms_image()."""
    big = 70_000  # 70_000**2 overflows int32
    spectra = [(np.array([1], dtype='i'), np.array([big], dtype='i'))] * 4
    imzml_reader = make_imzml_reader_mock(coordinates=MOCK_COORDINATES, spectra=spectra)
    for _ in imzml_reader.iter_spectra(np.arange(4)):
        pass

    rms = imzml_reader.rms_image()
    assert np.allclose(rms[imzml_reader.mask], big)


def test_imzml_reader_lithops(executor):
    imzml_reader = make_lithops_imzml_reader(
        executor.storage, mz_precision='d', polarity='negative'
    )

    spectra = list(imzml_reader.iter_spectra(executor.storage, np.arange(imzml_reader.n_spectra)))

    assert imzml_reader.mz_precision == 'd'
    for sp_idx, (mzs, ints) in enumerate(MOCK_SPECTRA):
        _sp_idx, _mzs, _ints = spectra[sp_idx]
        assert np.array_equal(mzs, _mzs)
        assert np.array_equal(ints, np.float32(_ints))

    assert np.array_equal(imzml_reader.xs, [0, 2, 0, 2])
    assert np.array_equal(imzml_reader.ys, [0, 0, 2, 2])
    assert np.array_equal(imzml_reader.pixel_indexes, [0, 2, 6, 8])

    assert np.array_equal(imzml_reader.raw_coord_bounds[0], [1, 1, 1])
    assert np.array_equal(imzml_reader.raw_coord_bounds[1], [3, 3, 1])
    assert imzml_reader.min_mz == 1.0
    assert imzml_reader.max_mz == 4.0

    assert np.array_equal(imzml_reader.tic_image(), EXPECTED_TIC, equal_nan=True)
    assert np.array_equal(imzml_reader.rms_image(), EXPECTED_RMS, equal_nan=True)
    assert np.array_equal(imzml_reader.median_image(), EXPECTED_MEDIAN, equal_nan=True)

    # Ensure imzml_reader is pickleable, as Lithops will pickle it
    p = pickle.dumps(imzml_reader)
