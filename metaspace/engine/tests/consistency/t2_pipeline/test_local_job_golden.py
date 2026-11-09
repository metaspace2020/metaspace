from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pandas as pd
import pytest

from sm.engine.annotation_lithops.annotation_job import LocalAnnotationJob
from tests.consistency.refs import check_ref
from tests.consistency.synth import (
    PIPELINE_DECOYS,
    make_ds_config,
    write_pipeline_imzml,
    write_pipeline_moldb,
)
from tests.consistency.tolerances import assert_close, assert_exact

pytestmark = pytest.mark.consistency

METRIC_COLUMNS = ['chaos', 'spectral', 'msm', 'mz_err_abs', 'mz_err_rel']


def _run(executor, sm_config, analysis_version, segm_size_mb=None):
    ds_config = make_ds_config(analysis_version, ppm=0.001)
    ds_config['isotope_generation']['adducts'] = ['[M]+']
    ds_config['fdr']['decoy_sample_size'] = len(PIPELINE_DECOYS)
    with TemporaryDirectory() as data_dir, TemporaryDirectory() as out_dir:
        imzml_path, ibd_path = write_pipeline_imzml(data_dir, ds_config)
        job = LocalAnnotationJob(
            imzml_file=imzml_path,
            ibd_file=ibd_path,
            moldb_files=[write_pipeline_moldb(data_dir)],
            ds_config=ds_config,
            sm_config=sm_config,
            use_cache=False,
            executor=executor,
            out_dir=out_dir,
        )
        if segm_size_mb:
            job.pipe.ds_segm_size_mb = segm_size_mb
        job.run(debug_validate=not segm_size_mb, perform_enrichment=False)
        if segm_size_mb:
            assert len(job.pipe.ds_segms_cobjs) > 1
        results = pd.read_csv(Path(out_dir) / 'results_db.csv')
    return results.sort_values(['formula', 'adduct']).reset_index(drop=True)


def _as_data(results):
    data = {
        'formula': results.formula.tolist(),
        'adduct': results.adduct.tolist(),
        'spatial': results.spatial.tolist(),
        'fdr': results.fdr.tolist(),
    }
    data.update({col: results[col].tolist() for col in METRIC_COLUMNS})
    return data


def _compare(actual, expected):
    assert_exact(actual['formula'], expected['formula'], 'formula')
    assert_exact(actual['adduct'], expected['adduct'], 'adduct')
    for col in METRIC_COLUMNS:
        assert_close(actual[col], expected[col], 'NUM_METRIC', col)
    assert_close(actual['spatial'], expected['spatial'], 'NUM_ORDER', 'spatial')
    assert_close(actual['fdr'], expected['fdr'], 'FDR_SAME_DECOYS', 'fdr')


@pytest.mark.parametrize('analysis_version', [1, 3])
@patch('sm.engine.annotation.fdr.DECOY_ADDUCTS', PIPELINE_DECOYS)
@patch('sm.engine.annotation_lithops.segment_centroids.MIN_CENTR_SEGMS', 2)
def test_local_job_results_match_reference(executor, sm_config, analysis_version):
    results = _run(executor, sm_config, analysis_version)
    data = _as_data(results)
    assert (results.msm > 0).any() and (results.spatial > 0).any()
    check_ref(f'pipeline/v{analysis_version}/results', data, _compare)


@patch('sm.engine.annotation.fdr.DECOY_ADDUCTS', PIPELINE_DECOYS)
@patch('sm.engine.annotation_lithops.segment_centroids.MIN_CENTR_SEGMS', 2)
def test_local_job_segment_size_invariance(executor, sm_config):
    whole = _as_data(_run(executor, sm_config, 3))
    split = _as_data(_run(executor, sm_config, 3, segm_size_mb=0.002))
    assert_exact(split['formula'], whole['formula'], 'formula')
    assert_close(split['spatial'], whole['spatial'], 'NUM_ORDER', 'spatial')
    for col in METRIC_COLUMNS + ['fdr']:
        assert_exact(split[col], whole[col], col)
