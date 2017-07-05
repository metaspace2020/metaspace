import json
import logging
import os
from enum import Enum

from sm.engine.queue import QueuePublisher, SM_ANNOTATE, SM_DS_STATUS
from sm.engine.mol_db import MolecularDB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.errors import UnknownDSID

logger = logging.getLogger('sm-engine')

DS_SEL = 'SELECT name, input_path, metadata, config FROM dataset WHERE id = %s'
DS_UPD = 'UPDATE dataset set name=%s, input_path=%s, metadata=%s, config=%s, status=%s where id=%s'
DS_INSERT = "INSERT INTO dataset (id, name, input_path, metadata, config, status) VALUES (%s, %s, %s, %s, %s, %s)"

IMG_URLS_BY_ID_SEL = ('SELECT iso_image_urls, ion_image_url '
                      'FROM iso_image_metrics m '
                      'JOIN job j ON j.id = m.job_id '
                      'JOIN dataset d ON d.id = j.ds_id '
                      'WHERE ds_id = %s')

class DatasetStatus(Enum):
    """ Stage of dataset lifecycle """

    """ The dataset is queued for processing """
    QUEUED = 1

    """ The processing is in progress """
    STARTED = 2

    """ The processing/reindexing finished successfully (most common) """
    FINISHED = 3

    """ An error occurred during processing """
    FAILED = 4

    """ The records are being updated because of changed metadata """
    INDEXING = 5

    """ The dataset has been deleted """
    DELETED = 6

class Dataset(object):
    """ Model class for representing a dataset """
    def __init__(self, id=None, name=None, input_path=None, metadata=None, config=None):
        self.id = id
        self.input_path = input_path
        self.meta = metadata
        self.config = config
        self.status = None
        self.name = name or (metadata.get('metaspace_options', {}).get('Dataset_Name', id) if metadata else None)

        self.reader = None

    @staticmethod
    def load_ds(ds_id, db):
        r = db.select_one(DS_SEL, ds_id)
        if r:
            ds = Dataset(ds_id)
            ds.name, ds.input_path, ds.meta, ds.config = r
        else:
            raise UnknownDSID('Dataset does not exist: {}'.format(ds_id))
        return ds

    def is_stored(self, db):
        r = db.select_one(DS_SEL, self.id)
        return True if r else False

    def save(self, db, es):
        assert self.status is not None
        rows = [(self.id, self.name, self.input_path, json.dumps(self.meta), json.dumps(self.config), self.status.name)]
        if not self.is_stored(db):
            db.insert(DS_INSERT, rows)
        else:
            row = rows[0]
            db.alter(DS_UPD, *(row[1:] + row[:1]))
        es.sync_dataset(self.id)


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
    """ Class for dataset data management in the engine

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

    def _reindex_ds(self, ds, update_status=True):
        if update_status:
            self.set_ds_status(ds, DatasetStatus.INDEXING)

        for mol_db_dict in ds.config['databases']:
            mol_db = MolecularDB(name=mol_db_dict['name'],
                                 version=mol_db_dict.get('version', None),
                                 iso_gen_config=ds.config['isotope_generation'])
            self._es.index_ds(ds.id, mol_db, del_first=True)

        if update_status:
            self.set_ds_status(ds, DatasetStatus.FINISHED)

    def _post_new_job_msg(self, ds):
        self.set_ds_status(ds, DatasetStatus.QUEUED)
        if self.mode == 'queue':
            msg = {
                'ds_id': ds.id,
                'ds_name': ds.name,
                'input_path': ds.input_path,
            }
            if ds.meta and ds.meta.get('metaspace_options').get('notify_submitter', True):
                email = ds.meta.get('Submitted_By', {}).get('Submitter', {}).get('Email', None)
                if email:
                    msg['user_email'] = email.lower()
            self._queue.publish(msg, SM_ANNOTATE)
            logger.info('New job message posted: %s', msg)

    # TODO: make sure the config and metadata are compatible
    def update_ds(self, ds):
        """
        Updates the database record and launches re-indexing or re-processing if necessary.
        """
        old_config = self._db.select_one(DS_SEL, ds.id)[3]
        config_diff = ConfigDiff.compare_configs(old_config, ds.config)

        if config_diff == ConfigDiff.EQUAL:
            self._reindex_ds(ds)
        elif config_diff == ConfigDiff.NEW_MOL_DB:
            # TODO use molecular database diff to avoid reprocessing
            self.add_ds(ds)
        elif config_diff == ConfigDiff.INSTR_PARAMS_DIFF:
            self.add_ds(ds)

    def add_ds(self, ds):
        """ Save dataset metadata (name, path, image bounds, coordinates) to the database.
        If the ds_id exists, delete the ds first
        """
        assert (ds.id and ds.name and ds.input_path and ds.config)

        if ds.is_stored(self._db):
            self.delete_ds(ds)

        self._post_new_job_msg(ds)
        logger.info("Inserted into dataset table: %s, %s", ds.id, ds.name)

    def _del_iso_images(self, ds):
        logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        img_store = ImageStoreServiceWrapper(self._sm_config['services']['iso_images'])
        ds_img_urls = []
        for iso_image_urls, ion_image_url in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            ds_img_urls.append(ion_image_url)
            ds_img_urls.extend(iso_image_urls)

        for url in ds_img_urls:
            if url:
                del_url = '{}/delete/{}'.format(self._sm_config['services']['iso_images'], url)
                img_store.delete_image(del_url)

    def delete_ds(self, ds, del_raw_data=False):
        assert ds.id or ds.name

        if not ds.id:
            r = self._db.select_one('SELECT id FROM dataset WHERE name = %s', ds.name)
            ds.id = r[0] if r else None

        if ds.id:
            logger.warning('ds_id already exists: {}. Deleting'.format(ds.id))
            self._del_iso_images(ds)
            self._es.delete_ds(ds.id)
            self._db.alter('DELETE FROM dataset WHERE id=%s', ds.id)
            if del_raw_data:
                logger.warning('Deleting raw data: {}'.format(ds.input_path))
                wd_man = WorkDirManager(ds.id)
                wd_man.del_input_data(ds.input_path)
            if self.mode == 'queue':
                self._queue.publish({'ds_id': ds.id, 'status': DatasetStatus.DELETED.name}, SM_DS_STATUS)
        else:
            logger.warning('No ds_id for ds_name: %s', ds.name)

    def set_ds_status(self, ds, status):
        ds.status = status
        ds.save(self._db, self._es)
        if self.mode == 'queue':
            self._queue.publish({'ds_id': ds.id, 'status': status.name}, SM_DS_STATUS)
