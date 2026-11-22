"""diff-ROI storage and ROI id validation against the real Postgres test database."""
import json
from io import BytesIO
from wsgiref.util import setup_testing_defaults

import numpy as np
import pandas as pd
import pytest

from sm.engine.db import DB
from sm.rest import diff_roi
from sm.rest.diff_roi_manager import DiffROIData, DiffROIManager

from tests.conftest import (  # pylint: disable=unused-import
    ds_config,
    empty_test_db,
    fill_db,
    metadata,
    sm_config,
    test_db,
)

DS_ID = '2000-01-01'  # created by fill_db with annotations (H2O, +H) and (CH4, +H)
OTHER_DS_ID = '2000-01-02'


def _insert_rois(db, ds_id, n):
    (user_id,) = db.select_one('SELECT id FROM graphql.user')
    return db.insert_return(
        "INSERT INTO roi (dataset_id, user_id, name, geojson) VALUES (%s, %s, %s, '{}') "
        "RETURNING id",
        rows=[(ds_id, user_id, f'roi {i}') for i in range(n)],
    )


@pytest.fixture()
def rois(fill_db):
    """Three ROIs of DS_ID and one of another dataset."""
    db = DB()
    db.alter(
        'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
        'status_update_dt, is_public) '
        'SELECT %s, name, input_path, upload_dt, metadata, config, status, status_update_dt, '
        'is_public FROM dataset WHERE id = %s',
        params=(OTHER_DS_ID, DS_ID),
    )
    return {'own': _insert_rois(db, DS_ID, 3), 'foreign': _insert_rois(db, OTHER_DS_ID, 1)[0]}


def _annotation_ids(db):
    return dict(db.select('SELECT formula, id FROM annotation'))


def _stored(db):
    return db.select(
        'SELECT annotation_id, roi_id, lfc, auc, group_label, reference_label, roi_lfc '
        'FROM diff_roi ORDER BY roi_id, annotation_id'
    )


def _seed_diff_rows(db, roi_ids):
    annotation_id = _annotation_ids(db)['H2O']
    db.insert(
        'INSERT INTO diff_roi (annotation_id, roi_id, lfc, auc, group_label, roi_lfc) '
        "VALUES (%s, %s, 9, 0.9, 'old', 9)",
        rows=[(annotation_id, roi_id) for roi_id in roi_ids],
    )


def _results_df(rows):
    df = pd.DataFrame(
        rows,
        columns=['formula', 'adduct', 'roi_id', 'log2fc', 'auc']
        + ['group_label', 'reference_label', 'roi_lfc'],
    )
    return df.astype({'log2fc': np.float32, 'auc': np.float32, 'roi_lfc': np.float32})


def test_save_replaces_only_rows_of_rois_in_scope(rois):
    db = DB()
    roi_a, roi_b, roi_c = rois['own']
    _seed_diff_rows(db, rois['own'])
    ann = _annotation_ids(db)
    df = _results_df(
        [
            # grouped ROI: label, reference and its own LFC
            ('H2O', '+H', roi_a, 1.5, 0.75, 'g', 'ref', 2.5),
            # single-member group: no label, roi_lfc NaN -> NULL
            ('CH4', '+H', roi_a, -0.25, 0.5, None, None, np.nan),
            # not an annotation of the dataset: dropped
            ('C6H12O6', '+H', roi_a, 3.0, 0.1, None, None, np.nan),
        ]
    )

    # roi_b is in scope without new rows: its old rows go; roi_c is out of scope: kept
    DiffROIManager(db).save_diff_roi_results(DS_ID, df, [str(roi_a), roi_b])

    assert _stored(db) == [
        (ann['H2O'], roi_a, 1.5, 0.75, 'g', 'ref', 2.5),
        (ann['CH4'], roi_a, -0.25, 0.5, None, None, None),
        (ann['H2O'], roi_c, 9.0, 0.9, 'old', None, 9.0),
    ]


def test_save_with_no_matching_annotation_still_clears_scope(rois):
    db = DB()
    roi_a, _, roi_c = rois['own']
    _seed_diff_rows(db, [roi_a, roi_c])
    df = _results_df([('C6H12O6', '+H', roi_a, 3.0, 0.1, None, None, np.nan)])

    DiffROIManager(db).save_diff_roi_results(DS_ID, df, [roi_a])

    assert [row[1] for row in _stored(db)] == [roi_c]


def test_save_rolls_back_the_delete_when_the_insert_fails(rois):
    db = DB()
    roi_a = rois['own'][0]
    _seed_diff_rows(db, [roi_a])
    before = _stored(db)
    # lfc is NOT NULL: a NaN log2fc becomes NULL and must fail rather than be stored as NaN
    df = _results_df([('H2O', '+H', roi_a, np.nan, 0.5, None, None, np.nan)])

    with pytest.raises(Exception, match='lfc'):
        DiffROIManager(db).save_diff_roi_results(DS_ID, df, [roi_a])

    assert _stored(db) == before


def test_save_of_many_rows_is_all_or_nothing_and_keeps_row_order(fill_db):
    # More rows than one multi-row INSERT page (psycopg2 execute_values sends 100 at a time)
    db = DB()
    roi_ids = _insert_rois(db, DS_ID, 80)
    ann = _annotation_ids(db)
    _seed_diff_rows(db, roi_ids[:2])
    before = _stored(db)
    rows = [
        (formula, '+H', roi_id, i + j / 4, 0.5, 'g' if i % 2 else None, None, np.nan)
        for i, roi_id in enumerate(roi_ids)
        for j, formula in enumerate(['H2O', 'CH4'])
    ]

    # the NULL lfc sits in the last page: the pages already sent must be rolled back with it
    failing = rows[:-1] + [('CH4', '+H', roi_ids[-1], np.nan, 0.5, None, None, np.nan)]
    with pytest.raises(Exception, match='lfc'):
        DiffROIManager(db).save_diff_roi_results(DS_ID, _results_df(failing), roi_ids)
    assert _stored(db) == before

    DiffROIManager(db).save_diff_roi_results(DS_ID, _results_df(rows), roi_ids)

    expected = [
        (ann[formula], roi_id, lfc, auc, label, None, None)
        for formula, _, roi_id, lfc, auc, label, _, _ in rows
    ]
    assert _stored(db) == sorted(expected, key=lambda row: (row[1], row[0]))
    stored_in_insert_order = db.select('SELECT annotation_id, roi_id FROM diff_roi ORDER BY id')
    assert stored_in_insert_order == [row[:2] for row in expected]


def test_check_roi_ids_accepts_rois_of_the_dataset(rois):
    data = DiffROIData(DS_ID, DB())
    data.check_roi_ids(rois['own'])
    data.check_roi_ids([str(i) for i in rois['own'][:2]])


def test_check_roi_ids_rejects_foreign_and_missing_rois(rois):
    data = DiffROIData(DS_ID, DB())
    missing = max(rois['own'] + [rois['foreign']]) + 1000

    with pytest.raises(ValueError) as exc_info:
        data.check_roi_ids(rois['own'] + [rois['foreign'], missing])

    assert str(exc_info.value) == (
        f'ROIs {sorted([rois["foreign"], missing])} do not belong to dataset {DS_ID}'
    )


@pytest.mark.parametrize('foreign_in', ['roi_ids', 'scope_roi_ids'])
def test_run_diff_roi_rejects_foreign_rois(rois, foreign_in):
    roi_ids = rois['own'][:2]
    scope = None
    if foreign_in == 'roi_ids':
        roi_ids = roi_ids + [rois['foreign']]
    else:
        scope = rois['own'] + [rois['foreign']]

    with pytest.raises(ValueError, match='do not belong to dataset'):
        DiffROIManager(DB()).run_diff_roi(DS_ID, roi_ids, scope)


def _post_compare_rois(body):
    payload = json.dumps(body).encode()
    environ = {
        'REQUEST_METHOD': 'POST',
        'PATH_INFO': '/compareROIs',
        'CONTENT_TYPE': 'application/json',
        'CONTENT_LENGTH': str(len(payload)),
        'wsgi.input': BytesIO(payload),
    }
    setup_testing_defaults(environ)
    status = []
    chunks = diff_roi.app(environ, lambda code, headers, exc_info=None: status.append(code))
    return status[0], json.loads(b''.join(chunks))


@pytest.mark.parametrize(
    'make_body',
    [
        lambda own, foreign: {'roi_ids': [own[0], foreign]},
        lambda own, foreign: {'roi_ids': own[:2], 'scope_roi_ids': own + [foreign]},
        lambda own, foreign: {'roi_ids': [own[0], max(own + [foreign]) + 1000]},
        lambda own, foreign: {'roi_ids': own[:2], 'scope_roi_ids': own[:1]},
        lambda own, foreign: {'roi_ids': own[:1]},
    ],
    ids=['foreign_roi', 'foreign_scope', 'missing_roi', 'roi_outside_scope', 'single_roi'],
)
def test_compare_rois_endpoint_rejects_invalid_roi_ids(rois, make_body):
    db = DB()
    _seed_diff_rows(db, rois['own'] + [rois['foreign']])
    before = _stored(db)

    status, body = _post_compare_rois({'ds_id': DS_ID, **make_body(rois['own'], rois['foreign'])})

    assert status.startswith('500')
    assert body == {'status': 'server_error'}
    assert _stored(db) == before
