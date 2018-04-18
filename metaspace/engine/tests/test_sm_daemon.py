import json
import logging
from datetime import datetime
from os.path import join
from queue import Queue
import time
from unittest.mock import MagicMock
from pytest import fixture, raises

from sm.engine.dataset_manager import SMDaemonDatasetManager, DatasetActionPriority
from sm.engine.errors import UnknownDSID
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import proj_root
from sm.engine.sm_daemon import SMDaemon
from sm.engine.search_job import SearchJob
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS, QueueConsumer
from sm.engine import DB, ESExporter, QueuePublisher, Dataset, SMapiDatasetManager, DatasetStatus
from sm.engine.tests.util import test_db, sm_config, ds_config


logging.basicConfig(level=logging.DEBUG)

ACTION_QDESC = SM_ANNOTATE
ACTION_QDESC['name'] = 'sm_test'

STATUS_QDESC = SM_DS_STATUS
STATUS_QDESC['name'] = 'sm_status_test'

SM_CONFIG_PATH = join(proj_root(), 'conf/test_config.json')


@fixture
def fill_db(test_db, sm_config, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    meta = {'Data_Type': 'Imaging MS'}
    db = DB(sm_config['db'])
    db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s, %s, %s)',
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(meta), json.dumps(ds_config), DatasetStatus.FINISHED)])


def create_api_ds_man(db=None, es=None, img_store=None, action_queue=None, sm_config=None):
    db = db or DB(sm_config['db'])
    es = es or ESExporter(db)
    img_store = img_store or MagicMock(spec=ImageStoreServiceWrapper)
    action_queue = action_queue or QueuePublisher(sm_config['rabbitmq'], ACTION_QDESC)
    action_queue.queue_args = {'x-max-priority': 3}
    return SMapiDatasetManager(db=db, es=es, image_store=img_store,
                               mode='queue', action_queue=action_queue)


def create_ds(ds_id=None, upload_dt=None, input_path=None, meta=None, ds_config=None):
    ds_id = ds_id or '2000-01-01'
    upload_dt = upload_dt or datetime.now()
    input_path = input_path or join(proj_root(), 'tests/data/imzml_example_ds')
    meta = meta or {'Data_Type': 'Imaging MS'}
    return Dataset(ds_id, 'imzml_example', input_path, upload_dt, meta, ds_config)


class Q(Queue):
    def get(self, **args):
        return Queue.get(self, timeout=1)


class SMDaemonDatasetManagerMock(SMDaemonDatasetManager):
    calls = Q()

    def add(self, ds, **kwargs):
        self.calls.put(('add', ds, kwargs))

    def update(self, ds, **kwargs):
        self.calls.put(('update', ds, kwargs))

    def delete(self, ds, **kwargs):
        self.calls.put(('delete', ds, kwargs))


@fixture
def clean_ds_man_mock(request):
    def fin():
        SMDaemonDatasetManagerMock.calls = Q()
    request.addfinalizer(fin)


@fixture
def delete_queue(sm_config):
    def _delete():
        for qdesc in [ACTION_QDESC, STATUS_QDESC]:
            queue_pub = QueuePublisher(sm_config['rabbitmq'], qdesc)
            queue_pub.delete_queue()

    # before tests
    _delete()
    yield
    # after tests
    _delete()


def run_sm_daemon(sm_daemon=None, wait=1):
    daemon = sm_daemon or SMDaemon(ACTION_QDESC, SMDaemonDatasetManagerMock, poll_interval=0.1)
    daemon.start()
    time.sleep(wait)
    daemon.stop()


def test_sm_daemon_receive_message(sm_config, clean_ds_man_mock, delete_queue):
    queue_pub = QueuePublisher(sm_config['rabbitmq'], ACTION_QDESC)
    msg = {'test': 'message'}
    queue_pub.publish(msg)

    def callback_side_effect(*args):
        print('WITHIN CALLBACK: ', args)

    callback = MagicMock()
    callback.side_effect = callback_side_effect
    on_success = MagicMock()
    on_failure = MagicMock()

    sm_daemon = SMDaemon(ACTION_QDESC, SMDaemonDatasetManagerMock)
    sm_daemon._callback = callback
    sm_daemon._on_success = on_success
    sm_daemon._on_failure = on_failure
    sm_daemon._action_queue_consumer = QueueConsumer(sm_config['rabbitmq'], ACTION_QDESC,
                                                     callback, on_success, on_failure,
                                                     logger_name='daemon', poll_interval=0.1)
    run_sm_daemon(sm_daemon)

    callback.assert_called_once_with(msg)
    on_success.assert_called_once_with(msg)
    on_failure.assert_not_called()


class TestSMDaemonSingleEventCases:

    def test_add__ds_exists__del_first(self, fill_db, clean_ds_man_mock, delete_queue, ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.add(ds, del_first=True, priority=DatasetActionPriority.HIGH)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'add'
        assert _ds.id == ds.id
        assert _kwargs['search_job_factory'] == SearchJob
        assert _kwargs['del_first'] == True

    def test_update(self, fill_db, clean_ds_man_mock, delete_queue, ds_config, sm_config):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        ds.meta['new'] = 'field'

        api_ds_man.update(ds)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'update'
        assert _ds.id == ds.id

    def test_delete(self, fill_db, clean_ds_man_mock, delete_queue, ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.delete(ds)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', None)

    # def test_update__does_not_exist_raises_exception(self, test_db, clean_ds_man_mock, delete_queue,
    #                                                  ds_config, sm_config):
    #     ds = create_ds(ds_config=ds_config)
    #     api_ds_man = create_api_ds_man(sm_config=sm_config)
    #
    #     with raises(UnknownDSID):
    #         api_ds_man.update(ds)

    # def test_delete__does_not_exist__raises_exception(self, test_db, clean_ds_man_mock, delete_queue,
    #                                                   ds_config, sm_config):
    #     ds = create_ds(ds_config=ds_config)
    #     api_ds_man = create_api_ds_man(sm_config=sm_config)
    #
    #     with raises(UnknownDSID):
    #         api_ds_man.update(ds)


class TestSMDaemonTwoEventsCases:

    def test_add_two_ds__second_with_high_priority__second_goes_first(self, test_db, sm_config, ds_config,
                                                                      delete_queue, clean_ds_man_mock):
        ds = create_ds(ds_id='2000-01-01', ds_config=ds_config)
        ds_pri = create_ds(ds_id='2000-01-02', ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        api_ds_man.add(ds_pri, priority=DatasetActionPriority.HIGH)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'add'
        assert _ds.id == ds_pri.id
        assert _kwargs['search_job_factory'] == SearchJob

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'add'
        assert _ds.id == ds.id
        assert _kwargs['search_job_factory'] == SearchJob

    def test_add_update_ds__new_meta__update_goes_first(self, test_db, sm_config, ds_config,
                                                        delete_queue, clean_ds_man_mock):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        ds.meta['new_field'] = 'value'
        api_ds_man.update(ds, priority=DatasetActionPriority.DEFAULT)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'update'
        assert _ds.id == ds.id

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'add'
        assert _ds.id == ds.id
        assert _kwargs['search_job_factory'] == SearchJob
        assert _kwargs['del_first'] == False

    # def test_add_update_ds__new_moldb(self, test_db, sm_config, ds_config, clean_ds_man_mock, delete_queue):
    #     api_ds_man = create_api_ds_man(sm_config=sm_config)
    #     ds = create_ds(ds_config=ds_config)
    #     api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
    #     ds.config['databases'].append({'name': 'ChEBI'})
    #     api_ds_man.update(ds, priority=DatasetActionPriority.DEFAULT)
    #
    #     run_sm_daemon()
    #
    #     method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
    #     assert method == 'add'
    #     assert _ds.id == ds.id
    #     assert _ds.config == ds.config
    #     assert _kwargs['search_job_factory'] == SearchJob

    # def test_add_update_ds__new_config(self, test_db, sm_config, ds_config, clean_ds_man_mock, delete_queue):
    #     api_ds_man = create_api_ds_man(sm_config=sm_config)
    #     ds = create_ds(ds_config=ds_config)
    #     api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
    #     ds.config['isotope_generation']['isocalc_sigma'] *= 2
    #     api_ds_man.update(ds)
    #
    #     run_sm_daemon()
    #
    #     method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
    #     assert method == 'add'
    #     assert _ds.id == ds.id
    #     assert _ds.config == ds.config
    #     assert _kwargs['search_job_factory'] == SearchJob
    #     assert _kwargs['del_first'] == False
    #
    #     method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
    #     assert method == 'add'
    #     assert _ds.id == ds.id
    #     assert _ds.config == ds.config
    #     assert _kwargs['search_job_factory'] == SearchJob
    #     assert _kwargs['del_first'] == True

    def test_add_delete_ds(self, test_db, sm_config, ds_config, clean_ds_man_mock, delete_queue):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds)
        api_ds_man.delete(ds)

        run_sm_daemon()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls.get()
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', False)
