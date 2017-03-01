from bottle import get, post, run
from bottle import request as req
from datetime import datetime as dt

from sm.engine.util import sm_log_config, init_logger
from sm.engine.util import SMConfig
from sm.engine import DatasetManager, Dataset
from sm.engine import DB, QueuePublisher, ESExporter


CONFIG_PATH = 'conf/config.json'


@post('/datasets/add')
def add_ds():
    ds = Dataset(req.forms.get('id', None) or dt.now().strftime("%Y-%m-%d_%Hh%Mm%Ss"),
                 req.forms.get('name', None),
                 req.forms.get('input_path'),
                 req.forms.get('metadata'),
                 req.forms.get('config'))
    ds_man.add_ds(ds)
    return 'ok'


@post('/datasets/<ds_id>/update')
def update_ds(ds_id):
    ds = Dataset.load_ds(ds_id, db)
    ds.name = req.forms.get('name', ds.name)
    ds.input_path = req.forms.get('input_path', ds.input_path)
    ds.meta = req.forms.get('metadata', ds.meta)
    ds.config = req.forms.get('config', ds.config)
    ds_man.update_ds(ds)
    return 'ok'


@post('/datasets/<ds_id>/delete')
def delete_ds(ds_id):
    ds = Dataset.load_ds(ds_id, db)
    ds_man.delete_ds(ds)
    return 'ok'

if __name__ == '__main__':
    init_logger()

    SMConfig.set_path(CONFIG_PATH)
    CONFIG = SMConfig.get_conf()
    db = DB(CONFIG['db'])
    ds_man = DatasetManager(db,
                            ESExporter(),
                            QueuePublisher(CONFIG['queue'], 'sm_annotate'))

    run(host='localhost', port=5123)
