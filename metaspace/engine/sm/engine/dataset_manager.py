import io
import logging
import requests
import numpy as np
from PIL import Image

from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.errors import DSIDExists
from sm.engine.mol_db import MolecularDB
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import SM_ANNOTATE, SM_DS_STATUS
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager

SEL_DATASET_OPTICAL_IMAGE = 'SELECT optical_image from dataset WHERE id = %s'
UPD_DATASET_OPTICAL_IMAGE = 'update dataset set optical_image = %s, transform = %s WHERE id = %s'

IMG_URLS_BY_ID_SEL = ('SELECT iso_image_ids '
                      'FROM iso_image_metrics m '
                      'JOIN job j ON j.id = m.job_id '
                      'JOIN dataset d ON d.id = j.ds_id '
                      'WHERE ds_id = %s')

INS_OPTICAL_IMAGE = 'INSERT INTO optical_image (id, ds_id, zoom) VALUES (%s, %s, %s)'
SEL_OPTICAL_IMAGE = 'SELECT id FROM optical_image WHERE ds_id = %s'
DEL_OPTICAL_IMAGE = 'DELETE FROM optical_image WHERE ds_id = %s'


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

    def add_optical_image(self, ds, url, transform, **kwargs):
        raise NotImplemented

    def _img_store(self):
        return ImageStoreServiceWrapper(self._sm_config['services']['img_service_url'])


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

        self._es.delete_ds(ds.id)
        for mol_db_dict in ds.config['databases']:
            mol_db = MolecularDB(name=mol_db_dict['name'],
                                 version=mol_db_dict.get('version', None),
                                 iso_gen_config=ds.config['isotope_generation'])
            self._es.index_ds(ds.id, mol_db)

        ds.set_status(self._db, self._es, self._queue, DatasetStatus.FINISHED)

    def _del_iso_images(self, ds):
        self.logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        img_store = self._img_store()
        for row in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            iso_image_ids = row[0]
            for img_id in iso_image_ids:
                if img_id:
                    img_store.delete_image_by_id('iso_image', img_id)

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

    def _annotation_image_shape(self, img_store, ds_id):
        ion_img_id = self._db.select(IMG_URLS_BY_ID_SEL + ' LIMIT 1', ds_id)[0][0][0]
        return img_store.get_image_by_id('iso_image', ion_img_id).size

    def _transform_scan(self, scan, transform_, dims, zoom):
        # zoom is relative to the web application viewport size and not to the ion image dimensions,
        # i.e. zoom = 1 is what the user sees by default, and zooming into the image triggers
        # fetching higher-resolution images from the server

        # TODO: adjust when everyone owns a Retina display
        VIEWPORT_WIDTH = 1000.0
        VIEWPORT_HEIGHT = 500.0

        zoom = int(round(zoom * min(VIEWPORT_WIDTH / dims[0], VIEWPORT_HEIGHT / dims[1])))

        transform = np.array(transform_)
        assert transform.shape == (3, 3)
        transform = transform / transform[2, 2]
        transform[:, :2] /= zoom
        coeffs = transform.flat[:8]
        return scan.transform((dims[0] * zoom, dims[1] * zoom),
                              Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    def _save_jpeg(self, img):
        buf = io.BytesIO()
        img.save(buf, 'jpeg', quality=90)
        buf.seek(0)
        return buf

    def _add_raw_optical_image(self, ds, optical_scan, transform):
        img_store = self._img_store()
        row = self._db.select_one(SEL_DATASET_OPTICAL_IMAGE, ds.id)
        if row and row[0]:
            img_store.delete_image_by_id('raw_optical_image', row[0])
        buf = self._save_jpeg(optical_scan)
        img_id = img_store.post_image('raw_optical_image', buf)
        self._db.alter(UPD_DATASET_OPTICAL_IMAGE, img_id, transform, ds.id)

    def _add_zoom_optical_images(self, ds, optical_scan, transform, zoom_levels):
        img_store = self._img_store()
        dims = self._annotation_image_shape(img_store, ds.id)
        rows = []
        for zoom in zoom_levels:
            img = self._transform_scan(optical_scan, transform, dims, zoom)
            buf = self._save_jpeg(img)
            img_id = img_store.post_image('optical_image', buf)
            rows.append((img_id, ds.id, zoom))

        for row in self._db.select(SEL_OPTICAL_IMAGE, ds.id):
            img_store.delete_image_by_id('optical_image', row[0])
        self._db.alter(DEL_OPTICAL_IMAGE, ds.id)
        self._db.insert(INS_OPTICAL_IMAGE, rows)

    def add_optical_image(self, ds, optical_scan, transform, zoom_levels=[1, 2, 4, 8], **kwargs):
        """ Generate scaled and transformed versions of the provided optical image """
        self.logger.info('Adding optical image to "%s" dataset', ds.id)
        self._add_raw_optical_image(ds, optical_scan, transform)
        self._add_zoom_optical_images(ds, optical_scan, transform, zoom_levels)

