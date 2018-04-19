import argparse
import json
from datetime import datetime
import logging
from bottle import post, run
from bottle import request as req
from bottle import response as resp

from sm.engine import DB, ESExporter
from sm.engine import Dataset, SMapiDatasetManager, DatasetActionPriority
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_DS_STATUS
from sm.engine.util import SMConfig
from sm.engine.util import init_loggers
from sm.engine.errors import UnknownDSID

OK = {
    'status_code': 200,
    'status': 'success'
}

ERR_OBJECT_NOT_EXISTS = {
    'status_code': 404,
    'status': 'Object Not Exists'
}

ERR_OBJECT_EXISTS = {
    'status_code': 400,
    'status': 'Already exists'
}

ERROR = {
    'status_code': 500,
    'status': 'Server error'
}


def _create_db_conn():
    config = SMConfig.get_conf()
    return DB(config['db'])


def _json_params(req):
    b = req.body.getvalue()
    return json.loads(b.decode('utf-8'))


def _create_queue_publisher(qdesc):
    config = SMConfig.get_conf()
    return QueuePublisher(config['rabbitmq'], qdesc)


def _create_dataset_manager(db):
    config = SMConfig.get_conf()
    img_store = ImageStoreServiceWrapper(config['services']['img_service_url'])
    return SMapiDatasetManager(db=db, es=ESExporter(db), image_store=img_store, mode='queue',
                               action_queue=_create_queue_publisher(SM_ANNOTATE),
                               status_queue=_create_queue_publisher(SM_DS_STATUS))


@post('/v1/datasets/add')
def add_ds():
    try:
        params = _json_params(req)
        logger.info('Received ADD request: %s', params)
        now = datetime.now()
        ds_id = params.get('id', None) or now.strftime("%Y-%m-%d_%Hh%Mm%Ss")
        ds = Dataset(ds_id,
                     params.get('name', None),
                     params.get('input_path'),
                     params.get('upload_dt', now),
                     params.get('metadata', None),
                     params.get('config'))
        db = _create_db_conn()
        ds_man = _create_dataset_manager(db)
        ds_man.add(ds, del_first=params.get('del_first', False),
                   priority=params.get('priority', DatasetActionPriority.DEFAULT))
        db.close()
        return {
            'status': OK['status'],
            'ds_id': ds_id
        }
    except Exception:
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
            except UnknownDSID:
                resp.status = ERR_OBJECT_NOT_EXISTS['status_code']
                return {
                    'status': ERR_OBJECT_NOT_EXISTS['status'],
                    'ds_id': ds_id
                }
            except Exception:
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
    ds.meta = params.get('metadata', ds.meta)
    ds.config = params.get('config', ds.config)

    ds_man.update(ds, priority=params.get('priority', DatasetActionPriority.DEFAULT))


@post('/v1/datasets/<ds_id>/delete')
@sm_modify_dataset('DELETE')
def delete_ds(ds_man, ds, params):
    del_raw = params.get('del_raw', False)
    ds_man.delete(ds, del_raw_data=del_raw)


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
    run(host='localhost', port=5123)
