"""Integration test for experiment_prep against real Postgres.

Validates the SQL queries `build_prep_block` issues against the real
`public.job` / `public.annotation` / `public.roi` schema. Image loading
is stubbed since image_storage round-trips are out of scope here.
"""
import json
import uuid
from datetime import datetime

import numpy as np
import pytest

from sm.engine.db import DB
from sm.engine.postprocessing.experiment_prep import build_prep_block

from .utils import create_test_molecular_db

# pylint: disable=unused-argument
@pytest.fixture()
def fixture_experiment(test_db, metadata, ds_config):
    db = DB()
    upload_dt = '2000-01-01 00:00:00'
    ds_id = 'ds-prep-itest'
    db.insert(
        'INSERT INTO dataset ('
        '  id, name, input_path, upload_dt, metadata, config, status, status_update_dt, is_public'
        ') VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
        rows=[
            (
                ds_id,
                'ds',
                'in',
                upload_dt,
                json.dumps(metadata),
                json.dumps(ds_config),
                'FINISHED',
                upload_dt,
                True,
            )
        ],
    )
    # graphql.ion is the FK target for annotation.ion_id; insert two rows.
    db.insert(
        'INSERT INTO graphql.ion (id, ion, formula, adduct, charge) ' 'VALUES (%s, %s, %s, %s, %s)',
        rows=[
            (901, 'C1H2+H', 'C1H2', '+H', 1),
            (902, 'C2H4+H', 'C2H4', '+H', 1),
        ],
    )
    # Create a moldb so the FK on job.moldb_id resolves.
    moldb = create_test_molecular_db()
    db.insert(
        'INSERT INTO job (id, moldb_id, ds_id, status, finish) VALUES (%s, %s, %s, %s, %s)',
        rows=[(5001, moldb.id, ds_id, 'FINISHED', datetime.now())],
    )
    db.insert(
        "INSERT INTO annotation (id, job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, "
        "stats, iso_image_ids, ion_id) "
        "VALUES (%s, %s, %s, '', '', %s, %s, %s, '{}', %s, %s)",
        rows=[
            (7001, 5001, 'C1H2', '+H', 0.9, 0.05, ['img-a'], 901),
            (7002, 5001, 'C2H4', '+H', 0.5, 0.20, ['img-b'], 902),
        ],
    )
    user_id = str(uuid.uuid4())
    db.insert(
        'INSERT INTO graphql.user (id, name, email, created_at, updated_at) '
        'VALUES (%s, %s, %s, %s, %s)',
        rows=[(user_id, 'n', 'n@e.com', datetime.now(), datetime.now())],
    )
    db.insert(
        'INSERT INTO public.roi (id, dataset_id, user_id, name, is_default, geojson) '
        'VALUES (%s, %s, %s, %s, %s, %s::jsonb)',
        rows=[
            (
                5050,
                ds_id,
                user_id,
                'roi-A',
                False,
                json.dumps(
                    {
                        'features': [
                            {
                                'properties': {
                                    'id': 5050,
                                    'coordinates': [
                                        {'x': 0, 'y': 0},
                                        {'x': 0, 'y': 1},
                                    ],
                                }
                            }
                        ]
                    }
                ),
            ),
            (
                5051,
                ds_id,
                user_id,
                'roi-B',
                False,
                json.dumps(
                    {
                        'features': [
                            {
                                'properties': {
                                    'id': 5051,
                                    'coordinates': [
                                        {'x': 1, 'y': 0},
                                        {'x': 1, 'y': 1},
                                    ],
                                }
                            }
                        ]
                    }
                ),
            ),
        ],
    )
    return {'ds_id': ds_id, 'moldb_id': moldb.id}


def test_build_prep_block_filters_and_resolves_intensities_against_real_db(fixture_experiment):
    db = DB()
    iso = {
        'img-a': np.array([[10, 20], [10, 20]], dtype=np.float32),
        'img-b': np.array([[0, 4], [0, 4]], dtype=np.float32),
    }
    datasets = [
        {
            'dataset_id': fixture_experiment['ds_id'],
            'region_source': 'roi',
            'regions': [
                {
                    'regionKey': 'r0',
                    'sourceKind': 'roi',
                    'roiId': 5050,
                    'segmentationId': None,
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's0'},
                },
                {
                    'regionKey': 'r1',
                    'sourceKind': 'roi',
                    'roiId': 5051,
                    'segmentationId': None,
                    'labelGroupName': 'g1',
                    'metadata': {'sampleId': 's1'},
                },
            ],
        }
    ]
    filters = {'fdr': 0.10, 'moldb_ids': [fixture_experiment['moldb_id']], 'adducts': ['+H']}

    out = build_prep_block(
        db,
        datasets,
        filters,
        load_iso_image=lambda ds_id, iid: iso[iid],
        load_label_map=lambda ds_id, sid: pytest.fail(
            'label_map should not be loaded for ROI regions'
        ),
    )

    assert out['ions_total'] == 1
    assert out['intensities'] == {'r0': {901: 10.0}, 'r1': {901: 20.0}}
    assert [s['sampleId'] for s in out['samples']] == ['s0', 's1']
    assert out['filterChain'][0]['count'] == 2
    # FDR filter dropped one ion.
    assert out['filterChain'][1]['count'] == 1
