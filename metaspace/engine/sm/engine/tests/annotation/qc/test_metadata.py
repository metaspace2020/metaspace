import numpy as np
import pytest
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.annotation.qc.metadata import extract_header_metadata, normalize_form_metadata


def write_imzml(path, mode, spec_type, polarity):
    mzs = np.linspace(100, 200, 20)
    with ImzMLWriter(str(path), mode=mode, spec_type=spec_type, polarity=polarity) as writer:
        for x in range(1, 4):
            writer.addSpectrum(mzs, np.ones(20), (x, 1, 1))
    return ImzMLParser(str(path))


@pytest.mark.parametrize(
    'mode, spec_type, polarity',
    [('continuous', 'profile', 'positive'), ('processed', 'centroid', 'negative')],
)
def test_extract_header_metadata_reads_declared_terms(tmp_path, mode, spec_type, polarity):
    parser = write_imzml(tmp_path / 'a.imzML', mode, spec_type, polarity)

    meta = extract_header_metadata(parser)

    assert meta['error'] is None
    assert meta['layout'] == mode
    assert meta['representation'] == spec_type
    assert meta['polarity'] == polarity
    assert meta['uuid']
    assert all(len(term) == 3 for term in meta['cv_terms'])


def test_extract_header_metadata_never_raises():
    meta = extract_header_metadata(object())

    assert meta['error']
    assert meta['polarity'] is None


def test_normalize_form_metadata_tolerates_missing_fields():
    form = normalize_form_metadata(
        {
            'MS_Analysis': {
                'Polarity': 'Positive',
                'Analyzer': 'Orbitrap',
                'Pixel_Size': {'Xaxis': 50, 'Yaxis': 60},
            }
        },
        {'image_generation': {'ppm': 3}},
    )

    assert form['polarity'] == 'positive'
    assert (form['pixel_size_x_um'], form['pixel_size_y_um']) == (50, 60)
    assert form['ppm'] == 3
    assert form['resolving_power'] is None
    assert normalize_form_metadata({}, {})['polarity'] is None
