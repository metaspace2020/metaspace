import json
import logging
import os

from sm.engine.queue import QueuePublisher
from sm.engine.mol_db import MolecularDB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager
from sm.engine.errors import UnknownDSID

logger = logging.getLogger('sm-engine')

DS_SEL = 'SELECT name, input_path, metadata, config FROM dataset WHERE id = %s'
DS_UPD = 'UPDATE dataset set name=%s, input_path=%s, metadata=%s, config=%s, status=%s where id=%s'
DS_UPD_STATUS = 'UPDATE dataset set status=%s where id=%s'
DS_INSERT = "INSERT INTO dataset (id, name, input_path, metadata, config, status) VALUES (%s, %s, %s, %s, %s, %s)"

IMG_URLS_BY_ID_SEL = ('SELECT iso_image_urls, ion_image_url '
                      'FROM iso_image_metrics m '
                      'JOIN job j ON j.id = m.job_id '
                      'JOIN dataset d ON d.id = j.ds_id '
                      'WHERE ds_id = %s')


class Dataset(object):
    """ Model class for representing a dataset """
    def __init__(self, id=None, name=None, input_path=None, metadata=None, config=None):
        self._sm_config = SMConfig.get_conf()
        self.id = id
        self.input_path = input_path
        self.meta = metadata
        self.config = config
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


def dict_to_paths(d):
    def flatten(pairs):
        for key, value in pairs:
            key = '/' + key
            if isinstance(value, dict):
                for subkey, subval in flatten(value.items()):
                    yield key + subkey, subval
            else:
                yield key,  str(value)
    return list(map(lambda (k, v): k + '/' + v, flatten(d.items())))


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
        return res


class DatasetManager(object):
    """ Class for dataset data management in the engine

        Args
        ----------
        db : sm.engine.DB
        es: sm.engine.ESExporter
        mode: unicode
            'local' or 'queue'
    """
    def __init__(self, db, es, mode):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self.mode = mode

    def _reindex_ds(self, ds):
        for mol_db_dict in ds.config['databases']:
            mol_db = MolecularDB(name=mol_db_dict['name'],
                                 version=mol_db_dict.get('version', None),
                                 ds_config=ds.config)
            self._es.index_ds(ds.id, mol_db, del_first=True)
        self.set_ds_status(ds, 'FINISHED')

    def _post_new_job_msg(self, ds):
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
            QueuePublisher(self._sm_config['rabbitmq'], 'sm_annotate').publish(msg)
            logger.info('New job message posted: %s', msg)

    def _proc_params_changed(self, old_meta, meta):
        old_meta_paths = dict_to_paths(old_meta)
        meta_paths = dict_to_paths(meta)
        changed_paths = set(old_meta_paths) - set(meta_paths)
        needsReproc = False
        for p in changed_paths:
            if p.startswith('/MS_Analysis') and not p.startswith('/MS_Analysis/Ionisation_Source'):
                needsReproc = True
            if p.startswith('/metaspace_options/Metabolite_Database'):
                needsReproc = True
        return needsReproc

    # TODO: make sure the config and metadata are compatible
    def update_ds(self, ds):
        old_config = self._db.select_one(DS_SEL, ds.id)[3]
        config_diff = ConfigDiff.compare_configs(old_config, ds.config)

        if config_diff == ConfigDiff.EQUAL:
            self._db.alter(DS_UPD, ds.name, ds.input_path, json.dumps(ds.meta), json.dumps(ds.config), 'INDEXING', ds.id)
            self._reindex_ds(ds)
        elif config_diff == ConfigDiff.NEW_MOL_DB:
            self._db.alter(DS_UPD, ds.name, ds.input_path, json.dumps(ds.meta), json.dumps(ds.config), 'QUEUED', ds.id)
            self._post_new_job_msg(ds)
        elif config_diff == ConfigDiff.INSTR_PARAMS_DIFF:
            self.add_ds(ds)

    def add_ds(self, ds):
        """ Save dataset metadata (name, path, image bounds, coordinates) to the database.
        If the ds_id exists, delete the ds first
        """
        assert (ds.id and ds.name and ds.input_path and ds.config)

        ds_row = [(ds.id, ds.name, ds.input_path, json.dumps(ds.meta), json.dumps(ds.config), 'QUEUED')]
        r = self._db.select_one(DS_SEL, ds.id)
        if r:
            self.delete_ds(ds)

        self._db.insert(DS_INSERT, ds_row)
        logger.info("Inserted into dataset table: %s, %s", ds.id, ds.name)
        self._post_new_job_msg(ds)

    def _del_iso_images(self, ds):
        logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        img_store = ImageStoreServiceWrapper(self._sm_config['services']['iso_images'])
        ds_img_urls = []
        for iso_image_urls, ion_image_url in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            ds_img_urls.append(ion_image_url)
            ds_img_urls.extend(iso_image_urls)

        for url in ds_img_urls:
            if url:
                del_url = '{}/delete/{}'.format(self._sm_config['services']['iso_images'], os.path.split(url)[1])
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
        else:
            logger.warning('No ds_id for ds_name: %s', ds.name)

    def set_ds_status(self, ds, status):
        self._db.alter(DS_UPD_STATUS, status, ds.id)
