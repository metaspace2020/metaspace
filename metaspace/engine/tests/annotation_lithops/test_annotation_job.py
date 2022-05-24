from contextlib import contextmanager
from datetime import datetime
from itertools import product
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import numpy as np
import pandas as pd
from lithops import Storage
from pyimzml.ImzMLWriter import ImzMLWriter

from sm.engine import molecular_db, image_storage
from sm.engine.annotation import fdr
from sm.engine.annotation.diagnostics import DiagnosticType, load_npy_image, DiagnosticImageKey
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob, LocalAnnotationJob
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB, ConnectionPool
from sm.engine.utils.perf_profile import perf_profile
from tests.conftest import (
    global_setup,
    empty_test_db,
    test_db,
    executor,
    sm_config,
    ds_config,
    metadata,
)
from sm.engine.annotation_lithops.executor import Executor

# Use monoisotopic decoys that won't have any overlap with the target peaks
MOCK_DECOY_ADDUCTS = ['+Be', '+Al']
MOCK_FORMULAS = [
    # Methanol, ethanol, propanol, etc. as they have a decent, non-overlapping isotopic spread
    f'C{i}H{2+2*i}O'
    for i in range(1, 11)
]
# 4x4 image missing the lower-right quarter
MOCK_COORDS = list(zip([2, 3, 4, 5, 2, 3, 4, 5, 2, 3, 2, 3], [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5]))


def make_mock_spectrum(ds_config):
    isocalc_wrapper = IsocalcWrapper(ds_config)
    formulas = [
        *MOCK_FORMULAS[:2],
        # Insert decoys after the first 2 formulas, so that the calculated FDRs are predictable:
        # first 10 formulas = 0/2 (quantized to 5% FDR)
        # remaining 90 formulas = 3/10 (quantized to 50% FDR)
        *(formula + decoy for formula, decoy in product(MOCK_FORMULAS[:3], fdr.DECOY_ADDUCTS)),
        *MOCK_FORMULAS[2:],
    ]
    mzs = []
    ints = []
    for i, formula in enumerate(formulas):
        formula_mzs, formula_ints = isocalc_wrapper.centroids(formula)
        mzs.extend(formula_mzs)
        # Reduce MSM based on the order in `formulas` by sabotaging spectral correlation
        sabotage = (1 - i / len(formulas)) ** np.arange(len(formula_ints))
        ints.extend(formula_ints * sabotage)

    mzs = np.array(mzs)
    ints = np.array(ints)
    order = np.argsort(mzs)
    return mzs[order], ints[order]
    # return mzs, ints


@contextmanager
def make_test_imzml(ds_config):
    mzs, ints = make_mock_spectrum(ds_config)
    with TemporaryDirectory() as tmpdir:
        with ImzMLWriter(f'{tmpdir}/test.imzML', polarity='positive') as writer:
            for x, y in MOCK_COORDS:
                # Scale intensity differently per spectrum, as chaos and spatial metrics
                # return 0 on completely uniform images
                writer.addSpectrum(mzs, ints * x * y, (x, y, 1))

        yield f'{tmpdir}/test.imzML', f'{tmpdir}/test.ibd'


def upload_test_imzml(storage: Storage, sm_config, ds_config):
    """Create an ImzML file, upload it into storage, and return an imzml_reader for it"""
    with make_test_imzml(ds_config) as (imzml_path, ibd_path):
        imzml_content = open(imzml_path, 'rb').read()
        ibd_content = open(ibd_path, 'rb').read()

    bucket, prefix = sm_config['lithops']['sm_storage']['imzml']
    storage.put_cloudobject(imzml_content, bucket, f'{prefix}/test_ds/test.imzML')
    storage.put_cloudobject(ibd_content, bucket, f'{prefix}/test_ds/test.ibd')
    return f'cos://{bucket}/{prefix}/test_ds'


@contextmanager
def make_test_molecular_db():
    with TemporaryDirectory() as tmpdir:
        fname = f'{tmpdir}/db.tsv'
        pd.DataFrame(
            {
                'id': [f'id_{i}' for i in range(len(MOCK_FORMULAS))],
                'name': [f'name_{i}' for i in range(len(MOCK_FORMULAS))],
                'formula': MOCK_FORMULAS,
            }
        ).to_csv(fname, sep='\t', index=False)
        yield fname


def import_test_molecular_db():
    with make_test_molecular_db() as fname:
        moldb = molecular_db.create(name='test db', version='v0.9a-final', file_path=fname)

    # Make it untargeted so that FDR is emitted
    DB().alter('UPDATE molecular_db SET targeted = false WHERE id = %s', params=(moldb.id,))

    return moldb.id


@patch('sm.engine.annotation.fdr.DECOY_ADDUCTS', MOCK_DECOY_ADDUCTS)
@patch('sm.engine.annotation_lithops.segment_centroids.MIN_CENTR_SEGMS', 2)  # Reduce log spam
def test_server_annotation_job(test_db, executor: Executor, sm_config, ds_config, metadata):
    db = DB()
    moldb_id = import_test_molecular_db()
    ds_config['database_ids'] = [moldb_id]
    ds_config['isotope_generation']['adducts'] = ['[M]+']  # test spectrum was made with no adduct
    # ds_config['isotope_generation']['n_peaks'] = 2  # minimize overlap between decoys and targets
    ds_config['image_generation']['ppm'] = 0.001  # minimize overlap between decoys and targets
    ds_config['fdr']['decoy_sample_size'] = len(MOCK_DECOY_ADDUCTS)
    input_path = upload_test_imzml(executor.storage, sm_config, ds_config)

    ds = Dataset(
        id=datetime.now().strftime('%Y-%m-%d_%Hh%Mm%Ss'),
        name='Test Lithops Dataset',
        input_path=input_path,
        upload_dt=datetime.now(),
        metadata=metadata,
        config=ds_config,
        is_public=True,
        status=DatasetStatus.QUEUED,
    )
    ds.save(db, None, allow_insert=True)

    with perf_profile(db, 'test_lithops_annotate', ds.id) as perf:
        # Overwrite executor's NullProfiler with a real profiler
        executor._perf = perf
        job = ServerAnnotationJob(executor=executor, ds=ds, perf=perf)
        job.run(debug_validate=True)

    def db_df(sql, args):
        return pd.DataFrame(db.select_with_fields(sql, args))

    jobs = db_df('SELECT * FROM job WHERE ds_id = %s', (ds.id,))
    anns = db_df(
        'SELECT * FROM annotation WHERE job_id = ANY(%s) ORDER BY msm DESC', (jobs.id.tolist(),)
    )
    diags = db_df('SELECT * FROM dataset_diagnostic WHERE ds_id = %s', (ds.id,))
    profiles = db_df('SELECT * FROM perf_profile WHERE ds_id = %s', (ds.id,))
    profile_entries = db_df(
        'SELECT * FROM perf_profile_entry WHERE profile_id = ANY(%s)', (profiles.id.tolist(),)
    )
    # For debugging annotations / FDR-related issues
    debug_data = job.pipe.debug_get_annotation_data(MOCK_FORMULAS[0], '')
    # print(debug_data)
    # db_data = load_cobjs(executor.storage, job.pipe.db_data_cobjs)[0]
    # print(db_data)
    # print(load_cobjs(executor.storage, job.pipe.ds_segms_cobjs))
    # moldb = pd.concat(load_cobjs(executor.storage, job.pipe.db_segms_cobjs))
    # formula_mzs = moldb.groupby('formula_i').mz.apply(list)
    # all_metrics = (
    #     job.pipe.formula_metrics_df.join(db_data['formula_map_df'].set_index('formula_i'))
    #     .join(formula_mzs)
    #     .sort_values('msm', ascending=False)
    # )
    # print(all_metrics)
    # print(job.pipe.ds_segments_bounds)
    # print(job.pipe.ds_segm_lens)
    # print(job.pipe.fdrs)

    # print(pd.DataFrame(anns))
    # print(pd.DataFrame(diags))
    # print(pd.DataFrame(profiles))
    # print(pd.DataFrame(profile_entries))

    # Validate jobs
    assert len(jobs) == 1
    assert jobs.moldb_id[0] == moldb_id

    # Validate annotations
    assert np.array_equal(anns.formula, MOCK_FORMULAS)  # Formulas should be MSM-descending
    assert np.array_equal(anns.fdr, [0.05] * 2 + [0.5] * 8)

    # Validate images were saved
    image_ids = [imgs[0] for imgs in anns.iso_image_ids]
    images = image_storage.get_ion_images_for_analysis(ds.id, image_ids)[0]
    assert images.shape == (len(anns), 4 * 4)
    # All non-masked pixels should have a value
    assert np.count_nonzero(images) == len(anns) * len(MOCK_COORDS)

    # Validate diagnostics
    metadata_diag = diags[diags.type == DiagnosticType.IMZML_METADATA].iloc[0]
    tic_diag = diags[diags.type == DiagnosticType.TIC].iloc[0]

    assert metadata_diag.error is None
    assert metadata_diag.data['n_spectra'] == len(MOCK_COORDS)
    assert metadata_diag.images[0]['key'] == DiagnosticImageKey.MASK
    mask_image = load_npy_image(ds.id, metadata_diag.images[0]['image_id'])
    assert np.count_nonzero(mask_image) == len(MOCK_COORDS)

    assert tic_diag.error is None
    assert tic_diag.data['min_tic'] > 0
    assert tic_diag.images[0]['key'] == DiagnosticImageKey.TIC
    tic_image = load_npy_image(ds.id, tic_diag.images[0]['image_id'])
    assert tic_image.dtype == np.float32
    assert tic_image.shape == (4, 4)
    assert np.array_equal(np.isnan(tic_image), ~mask_image)  # Masked area should be NaNs
    assert (tic_image[mask_image] > 0).all()  # Non-masked area should be non-zero

    # Validate perf profile
    assert len(profiles) == 1
    assert len(profile_entries) > 10


@patch('sm.engine.annotation.fdr.DECOY_ADDUCTS', MOCK_DECOY_ADDUCTS)
@patch('sm.engine.annotation_lithops.segment_centroids.MIN_CENTR_SEGMS', 2)  # Reduce log spam
def test_local_annotation_job(executor: Executor, sm_config, ds_config):
    ds_config['database_ids'] = [1]
    ds_config['isotope_generation']['adducts'] = ['[M]+']  # test spectrum was made with no adduct
    ds_config['image_generation']['ppm'] = 0.001  # minimize overlap between decoys and targets
    ds_config['fdr']['decoy_sample_size'] = len(MOCK_DECOY_ADDUCTS)
    with make_test_imzml(ds_config) as (imzml_path, ibd_path):
        with make_test_molecular_db() as moldb_path:
            with TemporaryDirectory() as out_dir:
                job = LocalAnnotationJob(
                    imzml_file=imzml_path,
                    ibd_file=ibd_path,
                    moldb_files=[moldb_path],
                    ds_config=ds_config,
                    executor=executor,
                    out_dir=out_dir,
                )

                job.run(debug_validate=True, perform_enrichment=False)

                output_files = list(Path(out_dir).glob('*.png'))
                assert len(output_files) == len(MOCK_FORMULAS) * 4

                results_csv = pd.read_csv(Path(out_dir) / 'results_db.csv')
                assert len(results_csv) == len(MOCK_FORMULAS)
