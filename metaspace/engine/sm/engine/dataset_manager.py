import logging

from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.errors import DSIDExists
from sm.engine.mol_db import MolecularDB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager

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
    def __init__(self, db=None, es=None, mode=None, queue_publisher=None, logger_name=None):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self.mode = mode
        self._queue = queue_publisher
        if self.mode == 'queue':
            assert self._queue
        self.logger = logging.getLogger(logger_name)

    def process(self, ds, action, **kwargs):
        raise NotImplemented

    def update(self, ds, **kwargs):
        raise NotImplemented

    def add(self, ds, **kwargs):
        raise NotImplemented

    def delete(self, ds, **kwargs):
        raise NotImplemented


class SMDaemonDatasetManager(DatasetManager):

    def __init__(self, db, es, mode, queue_publisher=None):
        DatasetManager.__init__(self, db=db, es=es, mode=mode,
                                queue_publisher=queue_publisher, logger_name='sm-daemon')

    def process(self, ds, action, **kwargs):
        if action == DatasetAction.ADD:
            self.add(ds, **kwargs)
        elif action == DatasetAction.UPDATE:
            self.update(ds, **kwargs)
        elif action == DatasetAction.DELETE:
            self.delete(ds, **kwargs)
        else:
            raise Exception('Wrong action: {}'.format(action))

    def add(self, ds, search_job_factory=None, del_first=False, **kwargs):
        """ Run an annotation job for the dataset. If del_first provided, delete first """
        if del_first:
            self.delete(ds)
        ds.save(self._db, self._es)
        search_job_factory().run(ds)

    def update(self, ds, **kwargs):
        """ Reindex all dataset results """
        ds.set_status(self._db, self._es, self._queue, DatasetStatus.INDEXING)

        for mol_db_dict in ds.config['databases']:
            mol_db = MolecularDB(name=mol_db_dict['name'],
                                 version=mol_db_dict.get('version', None),
                                 iso_gen_config=ds.config['isotope_generation'])
            self._es.index_ds(ds.id, mol_db, del_first=True)

        ds.set_status(self._db, self._es, self._queue, DatasetStatus.FINISHED)

    def _del_iso_images(self, ds):
        self.logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        img_store = ImageStoreServiceWrapper(self._sm_config['services']['iso_images'])
        for row in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            iso_image_ids = row[0]
            for id in iso_image_ids:
                if id:
                    del_url = '{}/delete/{}'.format(self._sm_config['services']['iso_images'], id)
                    img_store.delete_image(del_url)

    def delete(self, ds, del_raw_data=False, **kwargs):
        """ Delete all dataset related data from the DB """
        self.logger.warning('ds_id already exists: {}. Deleting'.format(ds.id))
        self._del_iso_images(ds)
        self._es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', ds.id)
        if del_raw_data:
            self.logger.warning('Deleting raw data: {}'.format(ds.input_path))
            wd_man = WorkDirManager(ds.id)
            wd_man.del_input_data(ds.input_path)
        if self.mode == 'queue':
            self._queue.publish({'ds_id': ds.id, 'status': DatasetStatus.DELETED}, SM_DS_STATUS)


class SMapiDatasetManager(DatasetManager):

    def __init__(self, qname, db, es, mode, queue_publisher=None):
        self.qname = qname
        DatasetManager.__init__(self, db=db, es=es, mode=mode,
                                queue_publisher=queue_publisher, logger_name='sm-api')

    def _post_sm_msg(self, ds, action, priority=DatasetActionPriority.DEFAULT, **kwargs):
        if self.mode == 'queue':
            msg = ds.to_queue_message()
            msg['action'] = action
            msg.update(kwargs)
            self._queue.publish(msg, self.qname, priority)
            self.logger.info('New message posted to %s: %s', self._queue, msg)
        ds.set_status(self._db, self._es, self._queue, DatasetStatus.QUEUED)

    def add(self, ds, del_first=False, priority=DatasetActionPriority.DEFAULT):
        """ Send add message to the queue. If dataset exists, raise an exception """
        if not del_first and ds.is_stored(self._db):
            raise DSIDExists('{} - {}'.format(ds.id, ds.name))
        self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority, del_first=del_first)

    def delete(self, ds, del_raw_data=False):
        """ Send delete message to the queue """
        self._post_sm_msg(ds=ds, action=DatasetAction.DELETE, priority=DatasetActionPriority.HIGH)

    def update(self, ds, priority=DatasetActionPriority.DEFAULT):
        """ Send update or add message to the queue or do nothing """
        old_ds = Dataset.load(self._db, ds.id)
        config_diff = ConfigDiff.compare_configs(old_ds.config, ds.config)
        meta_diff = old_ds.meta != ds.meta

        if config_diff == ConfigDiff.INSTR_PARAMS_DIFF:
            self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority, del_first=True)
        elif config_diff == ConfigDiff.NEW_MOL_DB:
            self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority)
        elif config_diff == ConfigDiff.EQUAL and meta_diff:
            self._post_sm_msg(ds=ds, action=DatasetAction.UPDATE, priority=DatasetActionPriority.HIGH)
        else:
            self.logger.info('Nothing to update: %s %s', ds.id, ds.name)
