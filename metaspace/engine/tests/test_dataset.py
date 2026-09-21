from datetime import datetime
import json
from unittest.mock import MagicMock
from pytest import fixture, mark

from sm.engine.dataset import (
    DatasetStatus,
    Dataset,
    generate_ds_config,
    _classify_instrument_label,
    _normalize_instrument,
)
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from .utils import create_test_molecular_db, create_test_ds


@fixture
def fill_db(test_db, metadata, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    db = DB()
    db.insert(
        (
            'INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
            'status_update_dt, is_public) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'
        ),
        rows=[
            (
                ds_id,
                'ds_name',
                'input_path',
                upload_dt,
                json.dumps(metadata),
                json.dumps(ds_config),
                DatasetStatus.FINISHED,
                upload_dt,
                True,
            )
        ],
    )
    create_test_molecular_db()


def test_generate_ds_config(fill_db, metadata, ds_config):
    generated_config = generate_ds_config(
        metadata, moldb_ids=[0], adducts=["+H", "+Na", "+K", "[M]+"]
    )

    assert generated_config == ds_config


def test_dataset_load_existing_ds_works(fill_db, metadata, ds_config):
    db = DB()
    upload_dt = datetime.strptime('2000-01-01 00:00:00', '%Y-%m-%d %H:%M:%S')
    ds_id = '2000-01-01'

    ds = Dataset.load(db, ds_id)

    assert ds.metadata == metadata
    ds_fields = {k: v for k, v in ds.__dict__.items() if not k.startswith('_')}
    assert ds_fields == dict(
        id=ds_id,
        name='ds_name',
        input_path='input_path',
        upload_dt=upload_dt,
        metadata=metadata,
        config=ds_config,
        size_hash=None,
        status=DatasetStatus.FINISHED,
        status_update_dt=upload_dt,
        metadata_v2=None,
        is_public=True,
    )


def test_dataset_save_overwrite_ds_works(fill_db, metadata, ds_config):
    db = DB()
    es_mock = MagicMock(spec=ESExporter)
    ds = create_test_ds()

    ds.save(db, es_mock)

    assert ds == Dataset.load(db, ds.id)
    es_mock.sync_dataset.assert_called_once_with(ds.id)


def test_dataset_update_status_works(fill_db, metadata, ds_config):
    db = DB()
    es_mock = MagicMock(spec=ESExporter)

    ds = create_test_ds(status=DatasetStatus.ANNOTATING)

    ds.set_status(db, es_mock, DatasetStatus.FINISHED)

    assert DatasetStatus.FINISHED == Dataset.load(db, ds.id).status


def test_dataset_to_queue_message_works(metadata, ds_config):
    upload_dt = datetime.now()
    ds_id = '2000-01-01'
    ds = Dataset(
        id=ds_id,
        name='ds_name',
        input_path='input_path',
        upload_dt=upload_dt,
        metadata=metadata,
        config=ds_config,
        status=DatasetStatus.QUEUED,
    )

    msg = ds.to_queue_message()

    assert {'ds_id': ds_id, 'ds_name': 'ds_name', 'input_path': 'input_path'} == msg


@mark.parametrize(
    'label,expected',
    [
        ('Q Exactive Plus', 'Orbitrap'),
        ('LTQ Orbitrap XL', 'Orbitrap'),
        ('solariX', None),  # no keyword match - a real gap, not the case under test here
        ('SolariX FT-ICR', 'FTICR'),
        ('SYNAPT G2-Si', 'TOF'),
        ('unrecognized instrument', None),
        (None, None),
    ],
)
def test_classify_instrument_label(label, expected):
    assert _classify_instrument_label(label) == expected


def test_normalize_instrument_curie_path_uses_ontology_label():
    db = MagicMock()
    db.select_one.return_value = ('Q Exactive Plus',)

    result = _normalize_instrument(None, 'MS:1002634', db)

    assert result == 'Orbitrap'
    db.select_one.assert_called_once()
    assert db.select_one.call_args.kwargs['params'] == ('MS:1002634',)


def test_normalize_instrument_curie_path_falls_back_when_unresolvable():
    # CURIE given but not found in ontology_term (e.g. stale/obsolete) - falls through to the
    # free-text heuristic rather than erroring.
    db = MagicMock()
    db.select_one.return_value = None

    result = _normalize_instrument('timsTOF Pro', 'MS:9999999', db)

    assert result == 'TOF'


@mark.parametrize(
    'free_text,ontology_label',
    [
        ('Q Exactive Plus', 'Q Exactive Plus'),  # Orbitrap
        ('SolariX FT-ICR', 'SolariX FT-ICR'),  # FTICR
        ('SYNAPT G2-Si', 'SYNAPT G2-Si'),  # TOF
        ('Orbitrap Exploris 480', 'Orbitrap Exploris 480'),  # the known ambiguous 'exploris' case
    ],
)
def test_normalize_instrument_curie_and_free_text_agree(free_text, ontology_label):
    """Compatibility check: resolving an instrument via its CURIE (canonical ontology label)
    must classify identically to the legacy free-text path, for every instrument class the
    substring heuristic recognizes - required so switching a submission from free text to a
    resolved CURIE never silently changes DSConfig."""
    db = MagicMock()
    db.select_one.return_value = (ontology_label,)

    legacy_result = _normalize_instrument(free_text)
    curie_result = _normalize_instrument(None, 'MS:0000000', db)

    assert curie_result == legacy_result


def test_generate_ds_config_with_metadata_v2_curie_matches_legacy(metadata, ds_config):
    # metadata['MS_Analysis']['Analyzer'] is 'FTICR' (see tests/utils.py's TEST_METADATA) - a
    # metadata_v2 CURIE whose ontology label also resolves to FTICR must produce an identical
    # DSConfig to the legacy-only call already covered by test_generate_ds_config.
    metadata_v2 = {
        'document': {
            'acquisition': {
                'instrument_model': {
                    'user_value': {'value_ontology_id': 'MS:1000448', 'curation_state': 'controlled'},
                }
            }
        }
    }
    db = MagicMock()
    db.select_one.return_value = ('FT-ICR',)

    legacy_config = generate_ds_config(metadata, moldb_ids=[0], adducts=["+H", "+Na", "+K", "[M]+"])
    v2_config = generate_ds_config(
        metadata,
        metadata_v2=metadata_v2,
        moldb_ids=[0],
        adducts=["+H", "+Na", "+K", "[M]+"],
        db=db,
    )

    assert v2_config == legacy_config == ds_config
