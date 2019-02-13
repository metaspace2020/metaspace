from datetime import datetime
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix

from sm.engine.colocalization import analyze_colocalization, Colocalization
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.tests.util import sm_config, test_db, metadata, ds_config, pyspark_context

def test_valid_colocalization_jobs_generated():
    annotations = []

    ion_images = np.array([np.linspace(0, 50, 50, False) % (i + 1) for i in range(20)])
    ion_ids = np.array(range(20)) * 4
    fdrs = np.array([[0.05, 0.1, 0.2, 0.5][i % 4] for i in range(20)])

    jobs = list(analyze_colocalization('ds_id', 'HMDB_v4', ion_images, ion_ids, fdrs))

    assert len(jobs) > 1
    assert not any(job.error for job in jobs)
    sample_job = [job for job in jobs if job.fdr == 0.2 and job.algorithm_name == 'cosine'][0]
    assert len(sample_job.sample_ion_ids) > 0
    assert len(sample_job.coloc_annotations) == 15
    assert len(sample_job.coloc_annotations[0][1]) > 0 # First annotation was colocalized with at least one other


def _make_sparse_ion_imgs(seed):
    pixels = np.linspace(0, 25, 25, False).reshape((5, 5)) % (seed or 1)
    return [coo_matrix(pixels)]


def test_new_ds_saves_to_db(test_db, metadata, ds_config, pyspark_context):
    db = DB(sm_config['db'])
    ds = Dataset('ds_id', 'ds_name', 'input_path', datetime.now(), metadata, mol_dbs=['HDMB'])
    ion_metrics_df = pd.DataFrame({'formula': ['H2O', 'H2O', 'CO2', 'CO2', 'H2SO4', 'H2SO4'],
                                   'adduct': ['+H', '+K', '+H', '+K', '+H', '+K'],
                                   'fdr': [0.05, 0.1, 0.05, 0.1, 0.05, 0.1]})
    num_ions = len(ion_metrics_df)

    test_images = [_make_sparse_ion_imgs(i) for i in range(num_ions)]
    ion_iso_images = pyspark_context.parallelize(zip(range(num_ions), test_images), num_ions)
    alpha_channel = np.linspace(0, 25, 25, False).reshape((5, 5)) % 2

    Colocalization(db).run_coloc_job_for_new_ds(ds, 'HMDB', ion_metrics_df, ion_iso_images, alpha_channel)

    jobs = db.select('SELECT id, error, sample_ion_ids FROM graphql.coloc_job')
    annotations = db.select('SELECT coloc_ion_ids, coloc_coeffs FROM graphql.coloc_annotation')
    ions = db.select('SELECT id FROM graphql.ion')

    assert len(jobs) > 0
    assert not any(job[1] for job in jobs)
    assert jobs[0][2]
    assert len(annotations) > 10
    assert all(len(ann[0]) == len(ann[1]) for ann in annotations)
    assert len(ions) == num_ions
