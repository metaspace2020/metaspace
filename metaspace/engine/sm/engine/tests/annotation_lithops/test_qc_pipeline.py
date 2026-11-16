from types import SimpleNamespace
from unittest.mock import patch

from sm.engine.annotation.qc.report import QCReport
from sm.engine.annotation_lithops.pipeline import Pipeline

STORE = 'sm.engine.annotation_lithops.pipeline.qc_store.save_qc_report'


def pipeline(ds_id='ds1', qc_report=QCReport()):
    return SimpleNamespace(ds_id=ds_id, qc_report=qc_report, _db='db')


def test_save_qc_report_passes_the_pipeline_db_to_the_store():
    pipe = pipeline()

    with patch(STORE) as save:
        Pipeline.save_qc_report(pipe)

    save.assert_called_once_with('ds1', pipe.qc_report, 'db')


def test_save_qc_report_is_skipped_without_a_dataset_id_or_a_report():
    with patch(STORE) as save:
        Pipeline.save_qc_report(pipeline(ds_id=None))
        Pipeline.save_qc_report(pipeline(qc_report=None))

    save.assert_not_called()


def test_a_failing_store_never_breaks_the_pipeline():
    with patch(STORE, side_effect=RuntimeError('db down')):
        Pipeline.save_qc_report(pipeline())
