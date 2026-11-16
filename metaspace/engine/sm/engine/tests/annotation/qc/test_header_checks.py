import numpy as np

from sm.engine.annotation.qc import header_checks as hc
from sm.engine.annotation.qc.config import DEFAULT_CHECKS
from sm.engine.annotation.qc.report import Evidence

HEADER = {
    'polarity': 'positive',
    'representation': 'centroid',
    'layout': 'processed',
    'pixel_size_x_um': 50.0,
    'pixel_size_y_um': 50.0,
    'max_pixels_x': 10,
    'max_pixels_y': 8,
    'uuid': '{00112233-4455-6677-8899-aabbccddeeff}',
    'has_ibd_checksum': False,
    'instrument_models': ['Q Exactive HF'],
    'sources': ['matrix-assisted laser desorption ionization'],
    'analyzers': ['orbitrap'],
    'matrix': None,
    'softwares': ['converter'],
    'cv_terms': [],
}
FORM = {
    'polarity': 'positive',
    'analyzer': 'Orbitrap',
    'source': 'MALDI',
    'matrix': 'DHB',
    'pixel_size_x_um': 50,
    'pixel_size_y_um': 50,
}


def rows_by_field(result):
    return {r['field']: r for r in result.details['rows']}


def test_metadata_form_matches_and_records_faults_without_blocking():
    clean = hc.check_metadata_form(HEADER, FORM, (10, 8))
    assert clean.value == 0
    assert not clean.would_block

    faulty_form = dict(FORM, polarity='negative', pixel_size_x_um=75)
    faulty = hc.check_metadata_form(HEADER, faulty_form, (10, 8))
    rows = rows_by_field(faulty)
    assert rows['polarity']['status'] == 'mismatch'
    assert rows['pixel_size_x_um']['status'] == 'mismatch'
    assert rows['pixel_size_y_um']['status'] == 'match'
    assert not faulty.would_block


def test_metadata_form_blocks_only_on_grid_contradiction_and_flags_desi_matrix():
    result = hc.check_metadata_form(HEADER, FORM, (11, 8))
    assert result.would_block
    assert rows_by_field(result)['grid_x']['status'] == 'contradiction'

    desi = hc.check_metadata_form(
        dict(HEADER, sources=['desorption electrospray ionization']), FORM, (10, 8)
    )
    assert rows_by_field(desi)['source_vs_matrix']['status'] == 'conflict'
    assert not desi.would_block


def test_profile_term_blocks_only_on_profile():
    assert hc.check_profile_term(dict(HEADER, representation='profile')).would_block
    assert not hc.check_profile_term(HEADER).would_block
    missing = hc.check_profile_term(dict(HEADER, representation=None))
    assert missing.evidence == Evidence.NOT_ASSESSABLE


def test_ontology_flags_unknown_and_renamed_terms():
    terms = [
        ('MS:1000130', 'positive scan', 'positive scan'),
        ('MS:1000128', 'profile spectrum', 'wrong name'),
        ('MS:9999999', 'made up', 'made up'),
    ]
    result = hc.check_ontology(dict(HEADER, cv_terms=terms))
    assert result.value == 2
    assert result.details['unknown_accessions'] == ['MS:9999999']
    assert result.details['renamed'][0]['accession'] == 'MS:1000128'
    assert hc.check_ontology(dict(HEADER, cv_terms=terms[:1])).value == 0


def test_declared_layout_contradiction():
    same, different = [16, 16, 16], [16, 96, 176]
    continuous = dict(HEADER, layout='continuous')
    assert not hc.check_declared_layout(continuous, same).would_block
    assert hc.check_declared_layout(continuous, different).would_block
    assert not hc.check_declared_layout(HEADER, same).would_block


def test_ibd_uuid_match_mismatch_and_unassessable():
    head = bytes.fromhex('00112233445566778899aabbccddeeff') + b'rest'
    assert hc.check_ibd_uuid(HEADER, head).value is True
    bad = hc.check_ibd_uuid(HEADER, bytes(16))
    assert bad.would_block
    assert hc.check_ibd_uuid(HEADER, None).evidence == Evidence.NOT_ASSESSABLE
    assert hc.check_ibd_uuid(dict(HEADER, uuid=None), head).evidence == Evidence.NOT_ASSESSABLE


def test_peak_count_and_empty_spectra_thresholds():
    cfg = DEFAULT_CHECKS['declared_peak_count']
    assert not hc.check_declared_peak_count(np.full(100, 500), cfg).would_block
    sparse = hc.check_declared_peak_count(np.full(100, 5), cfg)
    assert sparse.would_block and sparse.details['warn']

    empty_cfg = DEFAULT_CHECKS['empty_spectra']
    lengths = np.full(200, 100)
    assert not hc.check_empty_spectra(lengths, empty_cfg).would_block
    lengths[:10] = 0
    empty = hc.check_empty_spectra(lengths, empty_cfg)
    assert empty.would_block
    assert empty.details['first_indices'] == list(range(10))


def test_layout_checks():
    cfg = DEFAULT_CHECKS['layout_dense_size']
    ok = {'dense_size': 1000, 'n_spectra': 900, 'fill_fraction': 0.9}
    assert not hc.check_layout_dense_size(ok, cfg).would_block
    huge = dict(ok, dense_size=cfg['max_pixels'] + 1, fill_fraction=0.01)
    result = hc.check_layout_dense_size(huge, cfg)
    assert result.would_block and result.details['low_fill']
    assert hc.check_layout_dense_size({'n_spectra': 0}, cfg).evidence == Evidence.NOT_ASSESSABLE

    assert not hc.check_layout_coordinates({'n_invalid': 0, 'n_duplicates': 0}).would_block
    assert hc.check_layout_coordinates({'n_invalid': 0, 'n_duplicates': 3}).would_block
