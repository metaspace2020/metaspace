import logging
from typing import Dict

import bottle

from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_DS_STATUS, SM_UPDATE, SM_LITHOPS
from sm.engine.errors import UnknownDSID, DSIsBusy
from sm.engine.config import SMConfig
from sm.rest.dataset_manager import SMapiDatasetManager, DatasetActionPriority
from sm.rest.utils import NOT_EXIST, INTERNAL_ERROR, body_to_json, OK

BUSY = {'status_code': 409, 'status': 'dataset_busy'}

sm_config: Dict
logger = logging.getLogger('api')
app = bottle.Bottle()


def init(sm_config_):
    global sm_config  # pylint: disable=global-statement
    sm_config = sm_config_


def _create_queue_publisher(qdesc):
    config = SMConfig.get_conf()
    return QueuePublisher(config['rabbitmq'], qdesc, logger)


def _create_dataset_manager(db):
    return SMapiDatasetManager(
        db=db,
        es=ESExporter(db, sm_config),
        annot_queue=_create_queue_publisher(SM_ANNOTATE),
        update_queue=_create_queue_publisher(SM_UPDATE),
        lit_queue=_create_queue_publisher(SM_LITHOPS),
        status_queue=_create_queue_publisher(SM_DS_STATUS),
        logger=logger,
    )


def sm_modify_dataset(request_name):
    def _modify(handler):
        def _func(ds_id=None):
            try:
                params = body_to_json(bottle.request)
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


@app.post('/<ds_id>/add')
@app.post('/add')
@sm_modify_dataset('ADD')
def add(ds_man, ds_id=None, params=None):
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
        use_lithops=params.get('use_lithops', False),
        perform_enrichment=params.get('perform_enrichment', False),
    )
    return {'ds_id': ds_id}


@app.post('/<ds_id>/update')
@sm_modify_dataset('UPDATE')
def update(ds_man, ds_id, params):
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
        async_es_update
    }
    :return:
    """
    doc = params.get('doc', None)
    force = params.get('force', False)
    async_es_update = params.get('async_es_update', False)
    if not doc and not force:
        logger.info(f'Nothing to update for "{ds_id}"')
    else:
        priority = params.get('priority', DatasetActionPriority.STANDARD)
        ds_man.update(
            ds_id=ds_id, doc=doc, force=force, priority=priority, async_es_update=async_es_update
        )


@app.post('/<ds_id>/delete')
@sm_modify_dataset('DELETE')
def delete(ds_man, ds_id, params):
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


@app.post('/<ds_id>/add-optical-image')
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
    ds_man.add_optical_image(ds_id, params['url'], params['transform'])


@app.post('/<ds_id>/del-optical-image')
@sm_modify_dataset('DEL_OPTICAL_IMAGE')
def del_optical_image(ds_man, ds_id, params):  # pylint: disable=unused-argument
    """
    :param ds_man: rest.SMapiDatasetManager
    :param ds_id: string
    :param params: {}
    :return:
    """
    ds_man.del_optical_image(ds_id)
