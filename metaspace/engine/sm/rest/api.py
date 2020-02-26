import argparse
import json
import logging

import pandas as pd
import psycopg2.errors
import bottle

from sm.engine.db import DB, TransactionContext
from sm.engine.es_export import ESExporter
from sm.engine.molecular_db import MolecularDB, import_molecules_from_df, MalformedCSV
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_DS_STATUS, SM_UPDATE
from sm.engine.util import SMConfig, GlobalInit
from sm.engine.errors import UnknownDSID, DSIsBusy
from sm.rest.dataset_manager import SMapiDatasetManager, DatasetActionPriority
from sm.rest import isotopic_pattern

OK = {'status_code': 200, 'status': 'success'}

NOT_EXIST = {'status_code': 404, 'status': 'not_exist'}

ALREADY_EXISTS = {'status_code': 400, 'status': 'already_exists'}

WRONG_PARAMETERS = {'status_code': 400, 'status': 'wrong_parameters'}

BUSY = {'status_code': 409, 'status': 'dataset_busy'}

MALFORMED_CSV = {'status_code': 400, 'status': 'malformed_csv'}

INTERNAL_ERROR = {'status_code': 500, 'status': 'server_error'}

logger = logging.getLogger('api')


def _body_to_json(request):
    body = request.body.getvalue()
    return json.loads(body.decode('utf-8'))


def _make_response(status_doc, **kwargs):
    bottle.response.status = status_doc['status_code']
    return {'status': status_doc['status'], **kwargs}


def _create_queue_publisher(qdesc):
    config = SMConfig.get_conf()
    return QueuePublisher(config['rabbitmq'], qdesc, logger)


def _create_dataset_manager(db):
    img_store = ImageStoreServiceWrapper(sm_config['services']['img_service_url'])
    img_store.storage_type = 'fs'
    return SMapiDatasetManager(
        db=db,
        es=ESExporter(db, sm_config),
        image_store=img_store,
        annot_queue=_create_queue_publisher(SM_ANNOTATE),
        update_queue=_create_queue_publisher(SM_UPDATE),
        status_queue=_create_queue_publisher(SM_DS_STATUS),
        logger=logger,
    )


def sm_modify_dataset(request_name):
    def _modify(handler):
        def _func(ds_id=None):
            try:
                params = _body_to_json(bottle.request)
                logger.info(f'Received {request_name} request: {params}')
                ds_man = _create_dataset_manager(DB())
                res = handler(ds_man, ds_id, params)
                return {'status': OK['status'], 'ds_id': ds_id or res.get('ds_id', None)}
            except UnknownDSID as e:
                logger.warning(e)
                bottle.response.status = NOT_EXIST['status_code']
                return {'status': NOT_EXIST['status'], 'ds_id': ds_id}
            except DSIsBusy as e:
                logger.warning(e)
                bottle.response.status = BUSY['status_code']
                return {'status': BUSY['status'], 'ds_id': ds_id}
            except Exception as e:
                logger.exception(e)
                bottle.response.status = INTERNAL_ERROR['status_code']
                return {'status': INTERNAL_ERROR['status'], 'ds_id': ds_id}

        return _func

    return _modify


app = bottle.Bottle()  # pylint: disable=invalid-name


@app.get('/')
def root():
    return _make_response(OK)


@app.post('/v1/datasets/<ds_id>/add')
@app.post('/v1/datasets/add')
@sm_modify_dataset('ADD')
def add_ds(ds_man, ds_id=None, params=None):
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {
        doc {
            name
            input_path
            upload_dt
            metadata
            is_public
            (ds_config keys from sm.engine.dataset.FLAT_DS_CONFIG_KEYS)
        }
        priority
        force
        del_first
        email
    }
    """
    logger.info(f'Received ADD request: {params}')
    doc = params.get('doc', None)
    if not doc:
        msg = 'No input to create a dataset'
        logger.info(msg)
        raise Exception(msg)

    if ds_id:
        doc['id'] = ds_id
    ds_id = ds_man.add(
        doc=doc,
        del_first=params.get('del_first', False),
        force=params.get('force', False),
        email=params.get('email', None),
        priority=params.get('priority', DatasetActionPriority.DEFAULT),
    )
    return {'ds_id': ds_id}


@app.post('/v1/datasets/<ds_id>/update')
@sm_modify_dataset('UPDATE')
def update_ds(ds_man, ds_id, params):
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {
        doc {
            name
            input_path
            upload_dt
            metadata
            config
            is_public
            submitter_id
            group_id
            project_ids
        }
    }
    :return:
    """
    doc = params.get('doc', None)
    force = params.get('force', False)
    if not doc and not force:
        logger.info(f'Nothing to update for "{ds_id}"')
    else:
        priority = params.get('priority', DatasetActionPriority.STANDARD)
        ds_man.update(ds_id=ds_id, doc=doc, force=force, priority=priority)


@app.post('/v1/datasets/<ds_id>/delete')
@sm_modify_dataset('DELETE')
def delete_ds(ds_man, ds_id, params):
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {
        del_raw
        force
    }
    :return:
    """
    del_raw = params.get('del_raw', False)
    force = params.get('force', False)
    ds_man.delete(ds_id=ds_id, del_raw_data=del_raw, force=force)


@app.post('/v1/datasets/<ds_id>/add-optical-image')
@sm_modify_dataset('ADD_OPTICAL_IMAGE')
def add_optical_image(ds_man, ds_id, params):
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {
        url
        transform
    }
    :return:
    """
    img_id = params['url'].split('/')[-1]
    ds_man.add_optical_image(ds_id, img_id, params['transform'])


@app.post('/v1/datasets/<ds_id>/del-optical-image')
@sm_modify_dataset('DEL_OPTICAL_IMAGE')
def del_optical_image(ds_man, ds_id, params):  # pylint: disable=unused-argument
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {}
    :return:
    """
    ds_man.del_optical_image(ds_id)


@app.get('/v1/isotopic_patterns/<ion>/<instr>/<res_power>/<at_mz>/<charge>')
def generate(ion, instr, res_power, at_mz, charge):
    try:
        pattern = isotopic_pattern.generate(ion, instr, res_power, at_mz, charge)
        return _make_response(OK, data=pattern)
    except Exception as e:
        logger.warning(f'({ion}, {instr}, {res_power}, {at_mz}, {charge}) - {e}')
        return _make_response(INTERNAL_ERROR)


@app.post('/v1/molecular_dbs/create')
def create_molecular_database():
    """Create a molecular database and import molecules.

    Body format: {
        name - database name
        version - database version
        group_id - UUID of group database belongs to
        file_path - S3 path to database import file (s3://bucket/path)
    }
    """
    params = None
    try:
        params = _body_to_json(bottle.request)
        logger.info(f'Creating molecular database. Params: {params}')

        required_fields = ['name', 'version', 'group_id', 'file_path']
        if not all([field in params for field in required_fields]):
            return _make_response(WRONG_PARAMETERS, data=f'Required fields: {required_fields}')

        with TransactionContext():
            moldb = MolecularDB.create(
                params['name'], params['version'], params['group_id'], public=False
            )
            moldb_df = pd.read_csv(params['file_path'], sep='\t')
            import_molecules_from_df(moldb, moldb_df)
            # TODO: archive previous version of database
            # TODO: update "targeted" field

        return _make_response(OK, data=moldb.to_dict())
    except psycopg2.errors.UniqueViolation:  # pylint: disable=no-member
        logger.exception(f'Database already exists. Params: {params}')
        return _make_response(ALREADY_EXISTS)
    except MalformedCSV as e:
        logger.exception(f'Malformed CSV file. Params: {params}')
        return _make_response(MALFORMED_CSV, errors=e.errors)
    except Exception:
        logger.exception(f'Server error. Params: {params}')
        return _make_response(INTERNAL_ERROR)


@app.post('/v1/molecular_dbs/delete/<moldb_id>')
def delete_molecular_database(moldb_id):
    """Delete the molecular database and all associated jobs."""

    try:
        logger.info(f'Deleting molecular database. ID: {moldb_id}')
        MolecularDB.delete(moldb_id)
        return _make_response(OK)
    except Exception:
        logger.exception(f'Server error. ID: {moldb_id}')
        return _make_response(INTERNAL_ERROR)


@app.post('/v1/molecular_dbs/update/<moldb_id>')
def update_molecular_database(moldb_id):
    """Update a molecular database.

    Body format: {
        archived: {true/false}
    }
    """

    try:
        params = _body_to_json(bottle.request)
        logger.info(f'Updating molecular database. ID: {moldb_id}. Params: {params}')

        MolecularDB.update(moldb_id, params['archived'])
        return _make_response(OK)
    except Exception:
        logger.exception(f'Server error. ID: {moldb_id}. Params: {params}')
        return _make_response(INTERNAL_ERROR)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM Engine REST API')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', type=str, help='SM config path'
    )
    args = parser.parse_args()

    with GlobalInit(args.config_path) as sm_config:
        logger.info('Starting SM api')
        app.run(**sm_config['bottle'])
