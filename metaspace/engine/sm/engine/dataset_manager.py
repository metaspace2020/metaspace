import logging
from enum import Enum

from sm.engine.search_job import SearchJob
from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.mol_db import MolecularDB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager

logger = logging.getLogger('sm-engine')

IMG_URLS_BY_ID_SEL = ('SELECT iso_image_urls '
                      'FROM iso_image_metrics m '
                      'JOIN job j ON j.id = m.job_id '
                      'JOIN dataset d ON d.id = j.ds_id '
                      'WHERE ds_id = %s')


class DatasetAction(object):
    """ Dataset actions to be used in DatasetManager """
    ADD = 'ADD'
    UPDATE = 'UPDATE'
    DELETE = 'DELETE'


class DatasetActionPriority(object):
    """ Priorities used for messages sent to queue """
    LOW = 0
    STANDARD = 1
    HIGH = 2
    DEFAULT = LOW


class ConfigDiff:
    EQUAL, NEW_MOL_DB, INSTR_PARAMS_DIFF = range(3)

    @staticmethod
    def compare_configs(old, new):
        def mol_dbs_to_set(mol_dbs):
            return set((mol_db['name'], mol_db.get('version', None)) for mol_db in mol_dbs)

        res = ConfigDiff.EQUAL
        if old != new:
            old_rest, new_rest = old.copy(), new.copy()
            old_rest.pop('databases', None)
            new_rest.pop('databases', None)
            if old_rest != new_rest:
                res = ConfigDiff.INSTR_PARAMS_DIFF
            else:
                old_mol_dbs = mol_dbs_to_set(old.get('databases', []))
                new_mol_dbs = mol_dbs_to_set(new.get('databases', []))
                if len(new_mol_dbs - old_mol_dbs) > 0:
                    res = ConfigDiff.NEW_MOL_DB
                    # TODO: if some databases got removed from the list we need to delete these results
        return res


class DatasetManager(object):
    """ Abstract class for dataset data management in the engine.
        SMDaemonDatasetManager or SMapiDatasetManager should be instantiated instead

        Args
        ----------
        db : sm.engine.DB
        es: sm.engine.ESExporter
        mode: unicode
            'local' or 'queue'
        queue_publisher: sm.engine.queue.QueuePublisher
    """
    def __init__(self, db, es, mode, queue_publisher=None):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self.mode = mode
        self._queue = queue_publisher
        if self.mode == 'queue':
            assert self._queue

    def update(self, ds):
        raise NotImplemented

    def add(self, ds, **kwargs):
        raise NotImplemented

    def delete(self, ds, **kwargs):
        raise NotImplemented


class SMDaemonDatasetManager(DatasetManager):

    def __init__(self, db, es, mode, queue_publisher=None):
        DatasetManager.__init__(self, db=db, es=es, mode=mode, queue_publisher=queue_publisher)

    def process(self, ds, action, **kwargs):
        if action == DatasetAction.ADD:
            self.add(ds, **kwargs)
        elif action == DatasetAction.UPDATE:
            self.update(ds)
        elif action == DatasetAction.DELETE:
            self.delete(ds, **kwargs)

    def _set_status(self, ds, status):
        ds.set_status(self._db, self._es, self._queue, status)

    def add(self, ds, search_job=None):
        """ Run an annotation job for the dataset """
        assert search_job
        ds.save(self._db, self._es)
        search_job.run(ds)

    def update(self, ds):
        """ Reindex all dataset results """
        ds.set_status(self._db, self._es, self._queue, DatasetStatus.INDEXING)

        for mol_db_dict in ds.config['databases']:
            mol_db = MolecularDB(name=mol_db_dict['name'],
                                 version=mol_db_dict.get('version', None),
                                 iso_gen_config=ds.config['isotope_generation'])
            self._es.index_ds(ds.id, mol_db, del_first=True)

        ds.set_status(self._db, self._es, self._queue, DatasetStatus.FINISHED)

    def _del_iso_images(self, ds):
        logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        img_store = ImageStoreServiceWrapper(self._sm_config['services']['iso_images'])
        for row in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            iso_image_ids = row[0]
            for id in iso_image_ids:
                if id:
                    del_url = '{}/delete/{}'.format(self._sm_config['services']['iso_images'], id)
                    img_store.delete_image(del_url)

    def delete(self, ds, del_raw_data=False):
        """ Delete all dataset related data from the DB """
        logger.warning('ds_id already exists: {}. Deleting'.format(ds.id))
        self._del_iso_images(ds)
        self._es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', ds.id)
        if del_raw_data:
            logger.warning('Deleting raw data: {}'.format(ds.input_path))
            wd_man = WorkDirManager(ds.id)
            wd_man.del_input_data(ds.input_path)
        if self.mode == 'queue':
            self._queue.publish({'ds_id': ds.id, 'status': DatasetStatus.DELETED}, SM_DS_STATUS)


class SMapiDatasetManager(DatasetManager):

    def __init__(self, db, es, mode, queue_publisher=None):
        DatasetManager.__init__(self, db=db, es=es, mode=mode, queue_publisher=queue_publisher)

    def _post_sm_msg(self, ds, action, priority=DatasetActionPriority.DEFAULT):
        if self.mode == 'queue':
            msg = ds.to_queue_message()
            msg['action'] = action
            self._queue.publish(msg, SM_ANNOTATE, priority)
            logger.info('New job message posted: %s', msg)
        ds.set_status(self._db, self._es, self._queue, DatasetStatus.QUEUED)

    def add(self, ds, priority=DatasetActionPriority.DEFAULT):
        """ Send add message to the queue. If dataset exists, send delete message first """
        if ds.is_stored(self._db):
            self.delete(ds)
        priority = min(priority, DatasetActionPriority.HIGH)
        self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority)

    def delete(self, ds, del_raw_data=False):
        """ Send delete message to the queue """
        self._post_sm_msg(ds=ds, action=DatasetAction.DELETE, priority=DatasetActionPriority.HIGH)

    def update(self, ds, priority=DatasetActionPriority.DEFAULT):
        """ Send update or add message to the queue """
        old_config = Dataset.load(self._db, ds.id).config
        config_diff = ConfigDiff.compare_configs(old_config, ds.config)

        priority = min(priority, DatasetActionPriority.HIGH)
        if config_diff == ConfigDiff.EQUAL:
            self._post_sm_msg(ds=ds, action=DatasetAction.UPDATE, priority=DatasetActionPriority.HIGH)
        elif config_diff == ConfigDiff.NEW_MOL_DB:
            self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority)
        elif config_diff == ConfigDiff.INSTR_PARAMS_DIFF:
            self.add(ds, priority=priority)