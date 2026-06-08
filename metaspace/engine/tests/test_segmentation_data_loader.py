import json

import pytest

from sm.engine.db import DB
from sm.engine.postprocessing.segmentation_data_loader import SegmentationDataLoader
from .utils import create_test_molecular_db

# Tests deliberately exercise the internal annotation-filtering helper.
# pylint: disable=protected-access

DS_ID = '2000-01-01_seg'


def _insert_dataset(db, ds_id, analysis_version=1):
    config = {'analysis_version': analysis_version}
    db.insert(
        'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
        'status_update_dt, is_public) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
        rows=[
            (
                ds_id,
                'seg_ds',
                'input',
                '2000-01-01 00:00:00',
                '{}',
                json.dumps(config),
                'FINISHED',
                '2000-01-01 00:00:00',
                True,
            )
        ],
    )


def _insert_job_with_annotations(db, ds_id, moldb_id, annotations):
    """Insert a job and its annotations. ``annotations`` is a list of (adduct, fdr)."""
    (job_id,) = db.insert_return(
        'INSERT INTO job (moldb_id, ds_id, start) VALUES (%s, %s, now()) RETURNING id',
        rows=[(moldb_id, ds_id)],
    )
    rows = []
    for i, (adduct, fdr) in enumerate(annotations):
        rows.append(
            (
                job_id,
                f'C{i + 1}H2O',
                '',
                '',
                adduct,
                0.9,
                fdr,
                json.dumps({'theo_mz': [100.0 + i]}),
                [f'img_{i}'],
            )
        )
    db.insert(
        'INSERT INTO annotation (job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, '
        'stats, iso_image_ids) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
        rows=rows,
    )
    return job_id


@pytest.mark.usefixtures('test_db')
def test_fdr_filter_includes_boundary_annotations(sm_config):
    """annotation.fdr is `real` (float4); an annotation stored at exactly the requested
    FDR level must be returned. Without the `::real` cast in the query the stored 0.05
    promotes to 0.05000000074... > 0.05 and the boundary row is silently dropped."""
    db = DB()
    _insert_dataset(db, DS_ID)
    moldb = create_test_molecular_db(name='HMDB_seg', version='v1')  # not targeted
    _insert_job_with_annotations(
        db,
        DS_ID,
        moldb.id,
        [('+H', 0.05), ('+Na', 0.2)],  # boundary must be kept; 0.2 must be dropped
    )

    loader = SegmentationDataLoader(DS_ID, db, sm_config)
    anns = loader._get_filtered_annotations([moldb.id], fdr=0.05, adducts=None, off_sample=None)

    adducts = {a['adduct'] for a in anns}
    assert adducts == {'+H'}


@pytest.mark.usefixtures('test_db')
def test_targeted_db_ignores_fdr(sm_config):
    """Targeted (small custom) databases have no meaningful FDR — es_export overrides it with
    -1 so the webapp shows them at every FDR level. The loader must do the same and return
    all annotations regardless of their stored (placeholder) FDR."""
    db = DB()
    _insert_dataset(db, DS_ID, analysis_version=1)
    moldb = create_test_molecular_db(name='Custom_seg', version='v1')
    db.alter('UPDATE molecular_db SET targeted = TRUE WHERE id = %s', params=(moldb.id,))
    _insert_job_with_annotations(
        db,
        DS_ID,
        moldb.id,
        [('+H', 1.0), ('+Na', 1.0), ('+K', 0.05)],  # placeholder FDRs, all must be returned
    )

    loader = SegmentationDataLoader(DS_ID, db, sm_config)
    anns = loader._get_filtered_annotations([moldb.id], fdr=0.05, adducts=None, off_sample=None)

    assert len(anns) == 3
