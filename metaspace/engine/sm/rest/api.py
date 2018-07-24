import argparse
import json
from datetime import datetime
import logging

from bottle import post, run
from bottle import request as req
from bottle import response as resp

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.dataset import Dataset
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_DS_STATUS, SM_UPDATE
from sm.engine.util import SMConfig
from sm.engine.util import init_loggers
from sm.engine.errors import UnknownDSID, DSIsBusy
from sm.rest.dataset_manager import SMapiDatasetManager, DatasetActionPriority

OK = {
    'status_code': 200,
    'status': 'success'
}

ERR_DS_NOT_EXIST = {
    'status_code': 404,
    'status': 'not_exist'
}

ERR_OBJECT_EXISTS = {
    'status_code': 400,
    'status': 'already_exists'
}

ERR_DS_BUSY = {
    'status_code': 409,
    'status': 'dataset_busy'
}

ERROR = {
    'status_code': 500,
    'status': 'server_error'
}


def _create_db_conn():
    config = SMConfig.get_conf()
    return DB(config['db'])


def _json_params(req):
    b = req.body.getvalue()
    return json.loads(b.decode('utf-8'))


def _create_queue_publisher(qdesc):
    config = SMConfig.get_conf()
    return QueuePublisher(config['rabbitmq'], qdesc, logger)


def _create_dataset_manager(db):
    config = SMConfig.get_conf()
    img_store = ImageStoreServiceWrapper(config['services']['img_service_url'])
    img_store.storage_type = 'fs'
    return SMapiDatasetManager(db=db, es=ESExporter(db), image_store=img_store,
                               annot_queue=_create_queue_publisher(SM_ANNOTATE),
                               update_queue=_create_queue_publisher(SM_UPDATE),
                               status_queue=_create_queue_publisher(SM_DS_STATUS),
                               logger=logger)


@post('/v1/datasets/add')
def add_ds():
    ds_id = None
    try:
        params = _json_params(req)
        logger.info('Received ADD request: %s', params)
        now = datetime.now()
        ds_id = params.get('id', None) or now.strftime("%Y-%m-%d_%Hh%Mm%Ss")
        ds = Dataset(ds_id,
                     params.get('name', None),
                     params.get('input_path'),
                     params.get('upload_dt', now.isoformat()),
                     params.get('metadata', None),
                     params.get('config'),
                     is_public=params.get('is_public'),
                     mol_dbs=params.get('mol_dbs'),
                     adducts=params.get('adducts'))
        priority = params.get('priority', DatasetActionPriority.DEFAULT)

        db = _create_db_conn()
        ds_man = _create_dataset_manager(db)
        ds_man.add(ds, del_first=params.get('del_first', False),
                   force=params.get('force', False),
                   email=params.get('email', None))
        db.close()
        return {
            'status': OK['status'],
            'ds_id': ds_id
        }
    except DSIsBusy as e:
        logger.warning(e.message)
        resp.status = ERR_DS_BUSY['status_code']
        return {
            'status': ERR_DS_BUSY['status'],
            'ds_id': e.ds_id
        }
    except Exception as e:
        logger.error(e, exc_info=True)
        resp.status = ERROR['status_code']
        return {
            'status': ERROR['status'],
            'ds_id': ds_id
        }


def sm_modify_dataset(request_name):
    def _modify(handler):
        def _func(ds_id):
            try:
                params = _json_params(req)
                logger.info('Received %s request: %s', request_name, params)
                db = _create_db_conn()
                ds = Dataset.load(db=db, ds_id=ds_id)
                ds_man = _create_dataset_manager(db)
                handler(ds_man, ds, params)

                db.close()
                return {
                    'status': OK['status'],
                    'ds_id': ds_id
                }
            except UnknownDSID as e:
                logger.warning(e.message)
                resp.status = ERR_DS_NOT_EXIST['status_code']
                return {
                    'status': ERR_DS_NOT_EXIST['status'],
                    'ds_id': e.ds_id
                }
            except DSIsBusy as e:
                logger.warning(e.message)
                resp.status = ERR_DS_BUSY['status_code']
                return {
                    'status': ERR_DS_BUSY['status'],
                    'ds_id': e.ds_id
                }

            except Exception as e:
                logger.error(e, exc_info=True)
                resp.status = ERROR['status_code']
                return {
                    'status': ERROR['status'],
                    'ds_id': ds_id
                }
        return _func
    return _modify


@post('/v1/datasets/<ds_id>/update')
@sm_modify_dataset('UPDATE')
def update_ds(ds_man, ds, params):
    ds.name = params.get('name', ds.name)
    ds.input_path = params.get('input_path', ds.input_path)
    ds.metadata = params.get('metadata', ds.metadata)
    ds.upload_dt = params.get('upload_dt', ds.upload_dt)
    ds.config = params.get('config', ds.config)
    ds.is_public = params.get('is_public', ds.is_public)
    ds.mol_dbs = params.get('mol_dbs', ds.mol_dbs)
    force = params.get('force', False)
    ds_man.update(ds, force=force)


@post('/v1/datasets/<ds_id>/delete')
@sm_modify_dataset('DELETE')
def delete_ds(ds_man, ds, params):
    del_raw = params.get('del_raw', False)
    force = params.get('force', False)
    ds_man.delete(ds, del_raw_data=del_raw, force=force)


@post('/v1/datasets/<ds_id>/add-optical-image')
@sm_modify_dataset('ADD_OPTICAL_IMAGE')
def add_optical_image(ds_man, ds, params):
    img_id = params['url'].split('/')[-1]
    ds_man.add_optical_image(ds, img_id, params['transform'])


@post('/v1/datasets/<ds_id>/del-optical-image')
@sm_modify_dataset('DEL_OPTICAL_IMAGE')
def del_optical_image(ds_man, ds, params):
    ds_man.del_optical_image(ds)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM Engine REST API')
    parser.add_argument('--config', dest='config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()
    SMConfig.set_path(args.config_path)

    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger(name='api')
    logger.info('Starting SM api')
    run(**SMConfig.get_conf()['bottle'])
