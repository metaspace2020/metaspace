from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine.annotation.qc.config import load_qc_config
from sm.engine.annotation.qc.report import CheckResult, QCReport
from sm.engine.annotation.qc.store import save_qc_report
from sm.engine.annotation_lithops.io import load_cobj
from sm.engine.annotation_lithops.load_ds import load_ds
from sm.engine.db import DB

DS_ID = '2000-01-01'
N_QC_CHECKS = 22


def make_report(would_block, error=None):
    report = QCReport(error=error)
    report.add(CheckResult(name='profile_term', tier='A', would_block=would_block, runtime_ms=1.5))
    report.metrics['layout'] = {'n_components': 1}
    return report


def select_qc_rows():
    return DB().select_with_fields('SELECT * FROM dataset_qc')


def test_save_qc_report_replaces_the_row_and_cascades_on_dataset_delete(fill_db):
    save_qc_report(DS_ID, make_report(True))

    first = select_qc_rows()
    assert len(first) == 1
    assert first[0]['would_block'] is True
    assert first[0]['mode'] == 'shadow'
    assert first[0]['checks'][0]['name'] == 'profile_term'
    assert first[0]['timings'] == {'profile_term': 1.5}

    save_qc_report(DS_ID, make_report(False, error='tier B: boom'))

    second = select_qc_rows()
    assert len(second) == 1
    assert second[0]['would_block'] is False
    assert second[0]['metrics']['report_error'] == 'tier B: boom'
    assert second[0]['created_dt'] >= first[0]['created_dt']

    DB().alter('DELETE FROM dataset WHERE id = %s', params=(DS_ID,))
    assert select_qc_rows() == []


def upload_dataset(storage):
    rng = np.random.RandomState(0)
    with TemporaryDirectory() as tmpdir:
        with ImzMLWriter(f'{tmpdir}/ds.imzML', polarity='positive') as writer:
            for x in range(1, 7):
                for y in range(1, 6):
                    mzs = np.sort(rng.uniform(100, 900, 60))
                    writer.addSpectrum(mzs, rng.uniform(1, 100, 60), (x, y, 1))
        imzml_cobj = storage.put_cloudobject(open(f'{tmpdir}/ds.imzML', 'rb').read())
        ibd_cobj = storage.put_cloudobject(open(f'{tmpdir}/ds.ibd', 'rb').read())
    return imzml_cobj, ibd_cobj


def run_load_ds(executor, cobjs, qc_inputs):
    return load_ds(executor, cobjs[0], cobjs[1], 128, DS_ID, qc_inputs)


def test_load_ds_records_a_report_and_leaves_the_segments_unchanged(
    executor, sm_config, metadata, ds_config
):
    cobjs = upload_dataset(executor.storage)
    qc_conf = load_qc_config({'pre_annotation_qc': {'enabled': True}})
    qc_inputs = {'config': qc_conf, 'ds_metadata': metadata, 'ds_config': ds_config}
    disabled = {**qc_inputs, 'config': load_qc_config({})}

    *plain, plain_report = run_load_ds(executor, cobjs, disabled)
    *gated, gated_report = run_load_ds(executor, cobjs, qc_inputs)

    assert plain_report is None
    assert gated_report.error is None
    assert len(gated_report.checks) == N_QC_CHECKS
    assert all(check.error is None for check in gated_report.checks)
    assert {'tier_A', 'tier_B', 'tier_C1', 'tier_C2'} <= set(gated_report.timings)
    assert gated_report.metrics['layout']['n_components'] == 1
    ibd_uuid = next(check for check in gated_report.checks if check.name == 'ibd_uuid')
    assert ibd_uuid.value is True and not ibd_uuid.would_block

    assert np.array_equal(plain[1], gated[1])
    assert np.array_equal(plain[3], gated[3])
    for plain_cobj, gated_cobj in zip(plain[2], gated[2]):
        pd.testing.assert_frame_equal(
            load_cobj(executor.storage, plain_cobj), load_cobj(executor.storage, gated_cobj)
        )
