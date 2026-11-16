import json
from typing import Optional

from sm.engine.annotation.qc.report import Mode, QCReport
from sm.engine.db import DB

UPSERT = (
    'INSERT INTO dataset_qc (ds_id, gate_version, mode, would_block, created_dt, '
    '   checks, metrics, timings) '
    'VALUES (%(ds_id)s, %(gate_version)s, %(mode)s, %(would_block)s, NOW() AT TIME ZONE \'utc\', '
    '   %(checks)s, %(metrics)s, %(timings)s) '
    'ON CONFLICT (ds_id) DO UPDATE SET '
    '   gate_version = EXCLUDED.gate_version, mode = EXCLUDED.mode, '
    '   would_block = EXCLUDED.would_block, created_dt = EXCLUDED.created_dt, '
    '   checks = EXCLUDED.checks, metrics = EXCLUDED.metrics, timings = EXCLUDED.timings'
)


def save_qc_report(ds_id: str, report: QCReport, db: Optional[DB] = None) -> None:
    """Replace the dataset's QC row with this report. The report-level error, if any, is kept in
    the metrics under ``report_error``."""
    db = db or DB()
    doc = report.to_json()
    metrics = dict(doc['metrics'])
    if doc['error']:
        metrics['report_error'] = doc['error']
    db.alter(
        UPSERT,
        params={
            'ds_id': ds_id,
            'gate_version': doc['gate_version'],
            'mode': Mode.BLOCK.value
            if any(c.mode == Mode.BLOCK for c in report.checks)
            else Mode.SHADOW.value,
            'would_block': doc['would_block'],
            'checks': json.dumps(doc['checks']),
            'metrics': json.dumps(metrics),
            'timings': json.dumps(doc['timings']),
        },
    )
