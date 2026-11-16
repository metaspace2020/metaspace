import json

import numpy as np

from sm.engine.annotation.qc.config import DEFAULT_CHECKS, load_qc_config
from sm.engine.annotation.qc.report import CheckResult, Evidence, Mode, QCReport


def test_report_to_json_is_serialisable():
    report = QCReport()
    report.add(
        CheckResult(
            name='a',
            tier='A',
            value=np.float32(1.5),
            evidence=Evidence.INFERRED,
            mode=Mode.SHADOW,
            runtime_ms=2.0,
            details={'arr': np.arange(3), 'nan': float('nan')},
        )
    )
    out = json.loads(json.dumps(report.to_json()))
    check = out['checks'][0]
    assert check['evidence'] == 'inferred'
    assert check['mode'] == 'shadow'
    assert check['details'] == {'arr': [0, 1, 2], 'nan': None}
    assert out['timings'] == {'a': 2.0}


def test_report_would_block_follows_checks():
    report = QCReport()
    assert not report.would_block
    report.add(CheckResult(name='a', tier='A'))
    assert not report.would_block
    report.add(CheckResult(name='b', tier='A', would_block=True))
    assert report.would_block
    assert report.to_json()['would_block'] is True


def test_load_qc_config_defaults_and_overrides():
    assert load_qc_config({})['enabled'] is False

    conf = load_qc_config(
        {'pre_annotation_qc': {'enabled': True, 'checks': {'peak_count': {'fail_below': 5}}}}
    )
    assert conf['enabled'] is True
    assert conf['checks']['peak_count']['fail_below'] == 5
    assert conf['checks']['peak_count']['warn_below'] == DEFAULT_CHECKS['peak_count']['warn_below']
    assert DEFAULT_CHECKS['peak_count']['fail_below'] == 10
