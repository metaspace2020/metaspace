import json
from datetime import datetime
from os.path import join
from threading import Thread
import time
from mock import MagicMock
from pytest import fixture, raises

from sm.engine.dataset_manager import SMDaemonDatasetManager, DatasetActionPriority
from sm.engine.errors import UnknownDSID
from sm.engine.util import proj_root
from sm.engine.sm_daemon import SMDaemon
from sm.engine.search_job import SearchJob
from sm.engine import DB, ESExporter, QueuePublisher, Dataset, SMapiDatasetManager, DatasetStatus
from sm.engine.tests.util import test_db, sm_config, ds_config

QNAME = 'sm_test'
SM_CONFIG_PATH = join(proj_root(), 'conf/test_config.json')


@fixture
def fill_db(test_db, sm_config, ds_config):
    upload_dt = '2000-01-01 00:00:00'
    ds_id = '2000-01-01'
    meta = {"meta": "data"}
    db = DB(sm_config['db'])
    db.insert('INSERT INTO dataset values(%s, %s, %s, %s, %s, %s, %s)',
              rows=[(ds_id, 'ds_name', 'input_path', upload_dt,
                     json.dumps(meta), json.dumps(ds_config), DatasetStatus.FINISHED)])


def create_api_ds_man(db=None, es=None, queue_pub=None, sm_config=None):
    db = db or DB(sm_config['db'])
    es = es or ESExporter(db)
    queue_pub = queue_pub or QueuePublisher(sm_config['rabbitmq'])
    return SMapiDatasetManager(qname=QNAME, db=db, es=es, mode='queue', queue_publisher=queue_pub)


def create_ds(ds_id=None, upload_dt=None, input_path=None, meta=None, ds_config=None):
    ds_id = ds_id or '2000-01-01'
    upload_dt = upload_dt or datetime.now()
    input_path = input_path or join(proj_root(), 'tests/data/imzml_example_ds')
    meta = meta or {'metaspace_options': {}}
    return Dataset(ds_id, 'imzml_example', input_path, upload_dt, meta, ds_config)


class SMDaemonDatasetManagerMock(SMDaemonDatasetManager):
    calls = []

    def add(self, ds, **kwargs):
        self.calls.append(('add', ds, kwargs))

    def update(self, ds, **kwargs):
        self.calls.append(('update', ds, kwargs))

    def delete(self, ds, **kwargs):
        self.calls.append(('delete', ds, kwargs))


@fixture
def clean_rabbitmq(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'])
    queue_pub.queue_purge(QNAME)


@fixture
def clean_ds_man_mock(request):
    def fin():
        SMDaemonDatasetManagerMock.calls = []
    request.addfinalizer(fin)


def run_sm_daemon_thread(sm_daemon=None, wait=2):
    daemon = sm_daemon or SMDaemon(QNAME, SMDaemonDatasetManagerMock)
    t = Thread(target=daemon.start)
    t.start()
    time.sleep(wait)  # let the consumer fetch and process all messages
    daemon.stop()
    t.join()


def test_sm_daemon_receive_message(sm_config, clean_ds_man_mock, clean_rabbitmq):
    queue_pub = QueuePublisher(sm_config['rabbitmq'])
    msg = {'test': 'message'}
    queue_pub.publish(msg, qname=QNAME)

    def callback_side_effect(*args):
        print('WITHIN CALLBACK: ', args)

    callback = MagicMock()
    callback.side_effect = callback_side_effect
    on_success = MagicMock()
    on_failure = MagicMock()

    sm_daemon = SMDaemon(QNAME, SMDaemonDatasetManagerMock)
    sm_daemon.callback = callback
    sm_daemon.on_job_succeeded = on_success
    sm_daemon.on_job_failed = on_failure

    run_sm_daemon_thread(sm_daemon)

    callback.assert_called_once_with(msg)
    on_success.assert_called_once_with(msg)
    on_failure.assert_not_called()


class TestSMDaemonSingleEventCases:

    def test_add__ds_exists(self, fill_db, clean_ds_man_mock, clean_rabbitmq, ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.add(ds, priority=DatasetActionPriority.HIGH)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', None)

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[1]
        assert method == 'add'
        assert _ds.id == ds.id
        assert type(_kwargs['search_job']) == SearchJob

    def test_update(self, fill_db, clean_ds_man_mock, clean_rabbitmq, ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.update(ds)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'update'
        assert _ds.id == ds.id
        assert _kwargs == {}

    def test_delete(self, fill_db, clean_ds_man_mock, clean_rabbitmq, ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.delete(ds)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', None)

    def test_update__does_not_exist_raises_exception(self, test_db, clean_ds_man_mock, clean_rabbitmq,
                                                     ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        with raises(UnknownDSID):
            api_ds_man.update(ds)

    def test_delete__does_not_exist__raises_exception(self, test_db, clean_ds_man_mock, clean_rabbitmq,
                                                      ds_config, sm_config):
        ds = create_ds(ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        with raises(UnknownDSID):
            api_ds_man.update(ds)


class TestSMDaemonTwoEventsCases:

    def test_add_two_ds__second_with_high_priority__second_goes_first(self, test_db, sm_config, ds_config,
                                                                      clean_rabbitmq, clean_ds_man_mock):
        ds = create_ds(ds_config=ds_config)
        ds_pri = create_ds(ds_id='2000-01-02', ds_config=ds_config)
        api_ds_man = create_api_ds_man(sm_config=sm_config)

        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        api_ds_man.add(ds_pri, priority=DatasetActionPriority.HIGH)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'add'
        assert _ds.id == ds_pri.id
        assert type(_kwargs['search_job']) == SearchJob

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[1]
        assert method == 'add'
        assert _ds.id == ds.id
        assert type(_kwargs['search_job']) == SearchJob

    def test_add_update_ds__new_meta__update_goes_first(self, test_db, sm_config, ds_config,
                                                        clean_rabbitmq, clean_ds_man_mock):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        # ds.config['isotope_generation']['isocalc_sigma'] *= 2
        ds.meta['new_field'] = 'value'
        api_ds_man.update(ds, priority=DatasetActionPriority.DEFAULT)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'update'
        assert _ds.id == ds.id
        assert _kwargs == {}

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[1]
        assert method == 'add'
        assert _ds.id == ds.id
        assert type(_kwargs['search_job']) == SearchJob

    def test_add_update_ds__new_moldb(self, test_db, sm_config, ds_config, clean_ds_man_mock, clean_rabbitmq):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        ds.config['databases'].append({'name': 'ChEBI'})
        api_ds_man.update(ds, priority=DatasetActionPriority.DEFAULT)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'add'
        assert _ds.id == ds.id
        assert _ds.config == ds.config
        assert type(_kwargs['search_job']) == SearchJob

    def test_add_update_ds__new_config(self, test_db, sm_config, ds_config, clean_ds_man_mock, clean_rabbitmq):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        ds.config['isotope_generation']['isocalc_sigma'] *= 2
        api_ds_man.update(ds, priority=DatasetActionPriority.DEFAULT)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', None)

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[1]
        assert method == 'add'
        assert _ds.id == ds.id
        assert _ds.config == ds.config
        assert type(_kwargs['search_job']) == SearchJob

    def test_add_delete_ds(self, test_db, sm_config, ds_config, clean_ds_man_mock, clean_rabbitmq):
        api_ds_man = create_api_ds_man(sm_config=sm_config)
        ds = create_ds(ds_config=ds_config)
        api_ds_man.add(ds, priority=DatasetActionPriority.DEFAULT)
        api_ds_man.delete(ds)

        run_sm_daemon_thread()

        method, _ds, _kwargs = SMDaemonDatasetManagerMock.calls[0]
        assert method == 'delete'
        assert _ds.id == ds.id
        assert not _kwargs.get('del_raw_data', None)
