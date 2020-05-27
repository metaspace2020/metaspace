from datetime import datetime
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd

from sm.engine.colocalization import analyze_colocalization, Colocalization, FreeableRef
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.png_generator import ImageStoreServiceWrapper


def test_valid_colocalization_jobs_generated():
    ion_images = FreeableRef(np.array([np.linspace(0, 50, 50, False) % (i + 2) for i in range(20)]))
    ion_ids = np.array(range(20)) * 4
    fdrs = np.array([[0.05, 0.1, 0.2, 0.5][i % 4] for i in range(20)])

    jobs = list(analyze_colocalization('ds_id', 'HMDB_v4', ion_images, ion_ids, fdrs, 5, 10))

    assert len(jobs) > 1
    assert not any(job.error for job in jobs)
    sample_job = [job for job in jobs if job.fdr == 0.2 and job.algorithm_name == 'cosine'][0]
    assert len(sample_job.sample_ion_ids) > 0
    assert len(sample_job.coloc_annotations) == 15
    assert (
        len(sample_job.coloc_annotations[0][1]) > 0
    )  # First annotation was colocalized with at least one other


def mock_get_ion_images_for_analysis(storage_type, img_ids, **kwargs):
    images = (
        np.array(
            [np.linspace(0, 25, 25, False) % ((seed or 1) % 25) for seed in range(len(img_ids))],
            dtype=np.float32,
        )
        / 25
    )
    mask = (np.linspace(0, 25, 25, False).reshape((5, 5)) % 4 == 1) / 25
    return images, mask, (5, 5)


def test_new_ds_saves_to_db(test_db, metadata, ds_config):
    db = DB()
    (moldb_id,) = ds_config['database_ids']
    ds = Dataset(
        id='ds_id',
        name='ds_name',
        input_path='input_path',
        upload_dt=datetime.now(),
        metadata=metadata,
        config=ds_config,
    )
    ds.save(db)

    ion_metrics_df = pd.DataFrame(
        {
            'formula': ['H2O', 'H2O', 'CO2', 'CO2', 'H2SO4', 'H2SO4'],
            'adduct': ['+H', '[M]+', '+H', '[M]+', '+H', '[M]+'],
            'fdr': [0.05, 0.1, 0.05, 0.1, 0.05, 0.1],
            'image_id': list(map(str, range(6))),
        }
    )
    db.insert(
        'INSERT INTO molecular_db (id, name, version) VALUES (%s, %s, %s)',
        rows=[(moldb_id, 'HMDB-v4', '2018-04-03')],
    )
    (job_id,) = db.insert_return(
        "INSERT INTO job (moldb_id, ds_id, status) " "VALUES (%s, %s, 'FINISHED') " "RETURNING id",
        [(moldb_id, ds.id)],
    )
    db.insert(
        'INSERT INTO annotation(job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, stats, iso_image_ids) '
        "VALUES (%s, %s, '', '', %s, 1, %s, '{}', %s)",
        [(job_id, r.formula, r.adduct, r.fdr, [r.image_id]) for i, r in ion_metrics_df.iterrows()],
    )
    img_svc_mock = MagicMock(spec=ImageStoreServiceWrapper)
    img_svc_mock.get_ion_images_for_analysis.side_effect = mock_get_ion_images_for_analysis

    Colocalization(db, img_store=img_svc_mock).run_coloc_job(ds.id)

    jobs = db.select('SELECT id, error, sample_ion_ids FROM graphql.coloc_job')
    annotations = db.select('SELECT coloc_ion_ids, coloc_coeffs FROM graphql.coloc_annotation')
    ions = db.select('SELECT id FROM graphql.ion')

    assert len(jobs) > 0
    assert not any(job[1] for job in jobs)
    assert jobs[0][2]
    assert len(annotations) > 10
    assert all(len(ann[0]) == len(ann[1]) for ann in annotations)
    assert len(ions) == len(ion_metrics_df)
