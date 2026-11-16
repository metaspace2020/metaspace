from types import SimpleNamespace

import numpy as np
import pytest
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.annotation.imzml_reader import METADATA_FIELDS, ImzMLReader
from sm.engine.annotation.qc import gate
from sm.engine.annotation_lithops.load_ds import _sort_spectra
from sm.engine.annotation.qc.config import load_qc_config
from sm.engine.annotation.qc.report import CheckResult, QCReport

TIER_A_CHECKS = {
    'metadata_form',
    'profile_term',
    'ontology',
    'declared_layout',
    'ibd_uuid',
    'declared_peak_count',
    'empty_spectra',
    'layout_dense_size',
    'layout_coordinates',
}
FORM = {'MS_Analysis': {'Polarity': 'Positive', 'Analyzer': 'Orbitrap'}}


@pytest.fixture(name='reader')
def reader_fixture(tmp_path):
    path = tmp_path / 'ds.imzML'
    rng = np.random.RandomState(0)
    with ImzMLWriter(str(path), mode='processed', spec_type='centroid', polarity='positive') as w:
        for x in range(1, 6):
            for y in range(1, 5):
                mzs = np.sort(rng.uniform(100, 900, 80))
                w.addSpectrum(mzs, rng.uniform(1, 100, 80), (x, y, 1))
    parser = ImzMLParser(str(path), include_spectra_metadata=METADATA_FIELDS)
    reader = ImzMLReader(parser)
    reader.imzml_reader = parser.portable_spectrum_reader()
    reader.ibd_path = path.with_suffix('.ibd')
    return reader


def tier_a(reader, form=FORM, head=None):
    report = QCReport()
    qc_inputs = {
        'config': load_qc_config({'pre_annotation_qc': {'enabled': True}}),
        'ds_metadata': form,
        'ds_config': {'image_generation': {'ppm': 3}},
    }
    gate.run_tier_a(report, reader, qc_inputs, head)
    return report


def by_name(report):
    return {c.name: c for c in report.checks}


def test_tier_a_records_every_check_on_a_clean_dataset(reader):
    report = tier_a(reader)

    checks = by_name(report)
    assert set(checks) == TIER_A_CHECKS
    assert report.error is None
    assert not report.would_block
    assert all(c.error is None for c in report.checks)
    assert set(report.timings) >= TIER_A_CHECKS | {'tier_A'}
    assert report.metrics['layout']['n_components'] == 1


def test_tier_a_ibd_uuid_matches_real_file_and_detects_wrong_file(reader):
    with open(reader.ibd_path, 'rb') as f:
        real_head = f.read(16)

    ok = by_name(tier_a(reader, head=lambda: real_head))['ibd_uuid']
    wrong = by_name(tier_a(reader, head=lambda: bytes(16)))['ibd_uuid']

    assert ok.value is True and not ok.would_block
    assert wrong.would_block


def test_tier_a_flipped_polarity_in_form_is_recorded_not_blocking(reader):
    form = {'MS_Analysis': {'Polarity': 'Negative', 'Analyzer': 'Orbitrap'}}

    report = tier_a(reader, form)

    rows = {r['field']: r for r in by_name(report)['metadata_form'].details['rows']}
    assert rows['polarity']['status'] == 'mismatch'
    assert not report.would_block


def test_tier_a_duplicate_coordinates_would_block(reader):
    reader.xs[1], reader.ys[1] = reader.xs[0], reader.ys[0]

    report = tier_a(reader)

    assert by_name(report)['layout_coordinates'].would_block
    assert report.would_block


def test_a_failing_check_becomes_an_error_result_and_others_still_run():
    report = QCReport()
    conf = load_qc_config({})

    def boom():
        raise ValueError('bad')

    gate.run_check(report, conf, 'A', 'boom', boom)
    gate.run_check(report, conf, 'A', 'fine', lambda: CheckResult(name='fine', tier='A'))

    assert 'ValueError' in report.checks[0].error
    assert report.checks[1].error is None
    assert not report.would_block


def test_a_failing_tier_sets_report_error_without_raising():
    report = QCReport()

    def boom():
        raise RuntimeError('tier broke')

    gate.run_tier(report, 'A', boom)

    assert 'tier broke' in report.error


TIER_B_CHECKS = {
    'profile_likeness',
    'mz_order',
    'saturation',
    'intensity_transform',
    'near_floor',
    'sample_values',
}


def tier_b(reader, parser, form=FORM):
    reader.read_raw_spectra = lambda _storage, indices: (
        (int(i), *parser.getspectrum(int(i))) for i in indices
    )
    report = QCReport()
    qc_inputs = {
        'config': load_qc_config({'pre_annotation_qc': {'enabled': True}}),
        'ds_metadata': form,
        'ds_config': {},
    }
    gate.run_tier_b(report, reader, qc_inputs, storage=None)
    return report


def test_tier_b_records_every_check_and_never_blocks_in_shadow(reader):
    report = tier_b(reader, ImzMLParser(str(reader.ibd_path.with_suffix('.imzML'))))

    assert set(by_name(report)) == TIER_B_CHECKS
    assert report.error is None
    assert not report.would_block
    assert all(c.error is None and c.mode.value == 'shadow' for c in report.checks)
    assert report.metrics['sample']['n_spectra'] == reader.n_spectra


def test_tier_b_read_failure_only_sets_report_error(reader):
    reader.read_raw_spectra = None
    report = QCReport()
    qc_inputs = {'config': load_qc_config({}), 'ds_metadata': FORM, 'ds_config': {}}

    gate.run_tier_b(report, reader, qc_inputs, storage=None)

    assert report.error.startswith('tier B')
    assert not report.checks


TIER_C1_CHECKS = {'array_validity', 'zero_fraction', 'peak_count', 'tic'}
TIER_C2_CHECKS = {'low_occupancy', 'spatial_coherence', 'noise_combined'}


def loaded_arrays(reader):
    parser = ImzMLParser(str(reader.ibd_path.with_suffix('.imzML')))
    spectra = [parser.getspectrum(i) for i in range(reader.n_spectra)]
    mzs = np.concatenate([m for m, _ in spectra])
    ints = np.concatenate([i for _, i in spectra]).astype(np.float32)
    sp_lens = np.array([len(m) for m, _ in spectra])
    return mzs, ints, sp_lens


def qc_inputs_for(form=FORM):
    return {
        'config': load_qc_config({'pre_annotation_qc': {'enabled': True}}),
        'ds_metadata': form,
        'ds_config': {'image_generation': {'ppm': 3}},
    }


def test_tier_c1_records_every_check_on_loaded_arrays(reader):
    mzs, ints, sp_lens = loaded_arrays(reader)
    report = QCReport()

    gate.run_tier_c1(report, reader, qc_inputs_for(), mzs, ints, sp_lens)

    assert set(by_name(report)) == TIER_C1_CHECKS
    assert report.error is None and not report.would_block
    assert by_name(report)['zero_fraction'].value == 0


def test_tier_c1_zero_placeholders_are_reported_as_would_block(reader):
    mzs, ints, sp_lens = loaded_arrays(reader)
    keep = sp_lens // 2
    report = QCReport()
    gate.run_tier_c1(report, reader, qc_inputs_for(), mzs, ints, keep)

    assert by_name(report)['zero_fraction'].would_block


def test_tier_c2_runs_on_arrays_sorted_by_the_real_sort_function(reader):
    mzs, ints, sp_lens = loaded_arrays(reader)
    perf = SimpleNamespace(record_entry=lambda *args, **kwargs: None)
    mzs, ints, sp_idxs = _sort_spectra(reader, perf, mzs, ints, sp_lens)
    report = QCReport()

    gate.run_tier_c2(report, reader, qc_inputs_for(), mzs, ints, sp_idxs)

    assert set(by_name(report)) == TIER_C2_CHECKS
    assert report.error is None and not report.would_block
    assert all(c.error is None for c in report.checks)
    assert 'c2_binning' in report.timings
    assert by_name(report)['low_occupancy'].value is not None


def test_tier_c2_failure_does_not_raise(reader):
    report = QCReport()

    gate.run_tier_c2(report, reader, qc_inputs_for(), None, None, None)

    assert report.error.startswith('tier C2')
