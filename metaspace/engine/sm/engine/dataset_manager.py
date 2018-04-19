import io
import logging
import requests
import numpy as np
from PIL import Image

from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.errors import DSIDExists
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.mol_db import MolecularDB, MolDBServiceWrapper
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager

SEL_DATASET_RAW_OPTICAL_IMAGE = 'SELECT optical_image from dataset WHERE id = %s'
UPD_DATASET_RAW_OPTICAL_IMAGE = 'update dataset set optical_image = %s, transform = %s WHERE id = %s'
DEL_DATASET_RAW_OPTICAL_IMAGE = 'update dataset set optical_image = NULL, transform = NULL WHERE id = %s'

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


class DatasetManager(object):
    """ Abstract class for dataset data management in the engine.
        SMDaemonDatasetManager or SMapiDatasetManager should be instantiated instead

        Args
        ----------
        db : sm.engine.DB
        es: sm.engine.ESExporter
        img_store: sm.engine.png_generator.ImageStoreServiceWrapper
        mode: unicode
            'local' or 'queue'
        status_queue: sm.engine.queue.QueuePublisher
        logger_name: str
    """
    def __init__(self, db=None, es=None, img_store=None, mode=None,
                 status_queue=None, logger_name=None):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self._img_store = img_store
        self.mode = mode
        self._status_queue = status_queue
        self.logger = logging.getLogger(logger_name)

    def process(self, ds, action, **kwargs):
        raise NotImplemented

    def update(self, ds, **kwargs):
        raise NotImplemented

    def add(self, ds, **kwargs):
        raise NotImplemented

    def delete(self, ds, **kwargs):
        raise NotImplemented

    def add_optical_image(self, ds, img_id, transform, zoom_levels, **kwargs):
        raise NotImplemented

    def del_optical_image(self, ds, **kwargs):
        raise NotImplemented

    def _img_store(self):
        return ImageStoreServiceWrapper(self._sm_config['services']['img_service_url'])


class SMDaemonDatasetManager(DatasetManager):

    def __init__(self, db, es, img_store, mode=None, status_queue=None):
        DatasetManager.__init__(self, db=db, es=es, img_store=img_store, mode=mode,
                                status_queue=status_queue, logger_name='daemon')

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
        """ Run an annotation job for the dataset. If del_first provided, delete first
        """
        if del_first:
            self.logger.warning('Deleting all results for dataset: {}'.format(ds.id))
            self._del_iso_images(ds)
            self._es.delete_ds(ds.id)
            self._db.alter('DELETE FROM job WHERE ds_id=%s', ds.id)
        search_job_factory(img_store=self._img_store).run(ds)

    def _finished_job_moldbs(self, ds_id):
        moldb_service = MolDBServiceWrapper(self._sm_config['services']['mol_db'])
        for job_id, mol_db_id in self._db.select("SELECT id, db_id FROM job WHERE ds_id = %s", ds_id):
            yield job_id, moldb_service.find_db_by_id(mol_db_id)['name']

    def update(self, ds, **kwargs):
        """ Reindex all dataset results """
        ds.set_status(self._db, self._es, self._status_queue, DatasetStatus.INDEXING)

        self._es.delete_ds(ds.id)

        moldb_names = [d['name'] for d in ds.config['databases']]
        for job_id, mol_db_name in self._finished_job_moldbs(ds.id):
            if mol_db_name not in moldb_names:
                self._db.alter("DELETE FROM job WHERE id = %s", job_id)
            else:
                mol_db = MolecularDB(name=mol_db_name,
                                     iso_gen_config=ds.config['isotope_generation'])
                isocalc = IsocalcWrapper(ds.config['isotope_generation'])
                self._es.index_ds(ds_id=ds.id, mol_db=mol_db, isocalc=isocalc)

        ds.set_status(self._db, self._es, self._status_queue, DatasetStatus.FINISHED)

    def _del_iso_images(self, ds):
        self.logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        for row in self._db.select(IMG_URLS_BY_ID_SEL, ds.id):
            iso_image_ids = row[0]
            for img_id in iso_image_ids:
                if img_id:
                    self._img_store.delete_image_by_id('iso_image', img_id)

    def delete(self, ds, del_raw_data=False, **kwargs):
        """ Delete all dataset related data from the DB """
        self.logger.warning('Deleting dataset: {}'.format(ds.id))
        self._del_iso_images(ds)
        self._es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', ds.id)
        if del_raw_data:
            self.logger.warning('Deleting raw data: {}'.format(ds.input_path))
            wd_man = WorkDirManager(ds.id)
            wd_man.del_input_data(ds.input_path)
        if self.mode == 'queue':
            self._status_queue.publish({'ds_id': ds.id, 'status': DatasetStatus.DELETED})


class SMapiDatasetManager(DatasetManager):

    def __init__(self, db, es, image_store, mode, action_queue=None, status_queue=None):
        DatasetManager.__init__(self, db=db, es=es, img_store=image_store, mode=mode,
                                status_queue=status_queue, logger_name='api')
        self._action_queue = action_queue

    def _post_sm_msg(self, ds, action, priority=DatasetActionPriority.DEFAULT, **kwargs):
        if self.mode == 'queue':
            msg = ds.to_queue_message()
            msg['action'] = action
            msg.update(kwargs)

            ds.set_status(self._db, self._es, self._status_queue, DatasetStatus.QUEUED)
            self._action_queue.publish(msg, priority)
            self.logger.info('New message posted to %s: %s', self._action_queue, msg)

    def add(self, ds, del_first=False, priority=DatasetActionPriority.DEFAULT):
        """ Send add message to the queue. If dataset exists, raise an exception """
        self._post_sm_msg(ds=ds, action=DatasetAction.ADD, priority=priority, del_first=del_first)

    def delete(self, ds, del_raw_data=False):
        """ Send delete message to the queue """
        self._post_sm_msg(ds=ds, action=DatasetAction.DELETE, priority=DatasetActionPriority.HIGH)

    def update(self, ds, priority=DatasetActionPriority.DEFAULT):
        """ Send update or add message to the queue or do nothing """
        self._post_sm_msg(ds=ds, action=DatasetAction.UPDATE, priority=DatasetActionPriority.HIGH)

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

    def _add_raw_optical_image(self, ds, img_id, transform):
        row = self._db.select_one(SEL_DATASET_RAW_OPTICAL_IMAGE, ds.id)
        if row:
            old_img_id = row[0]
            if old_img_id and old_img_id != img_id:
                self._img_store.delete_image_by_id('raw_optical_image', old_img_id)
        self._db.alter(UPD_DATASET_RAW_OPTICAL_IMAGE, img_id, transform, ds.id)

    def _add_zoom_optical_images(self, ds, img_id, transform, zoom_levels):
        dims = self._annotation_image_shape(self._img_store, ds.id)
        rows = []
        optical_img = self._img_store.get_image_by_id('raw_optical_image', img_id)
        for zoom in zoom_levels:
            img = self._transform_scan(optical_img, transform, dims, zoom)
            buf = self._save_jpeg(img)
            scaled_img_id = self._img_store.post_image('optical_image', buf)
            rows.append((scaled_img_id, ds.id, zoom))

        for row in self._db.select(SEL_OPTICAL_IMAGE, ds.id):
            self._img_store.delete_image_by_id('optical_image', row[0])
        self._db.alter(DEL_OPTICAL_IMAGE, ds.id)
        self._db.insert(INS_OPTICAL_IMAGE, rows)

    def add_optical_image(self, ds, img_id, transform, zoom_levels=[1, 2, 4, 8], **kwargs):
        """ Generate scaled and transformed versions of the provided optical image """
        self.logger.info('Adding optical image to "%s" dataset', ds.id)
        self._add_raw_optical_image(ds, img_id, transform)
        self._add_zoom_optical_images(ds, img_id, transform, zoom_levels)

    def del_optical_image(self, ds, **kwargs):
        """ Deletes raw and zoomed optical images from DB and FS"""
        self.logger.info('Deleting optical image to "%s" dataset', ds.id)
        row = self._db.select_one(SEL_DATASET_RAW_OPTICAL_IMAGE, ds.id)
        if row:
            raw_img_id = row[0]
            if raw_img_id:
                self._img_store.delete_image_by_id('raw_optical_image', raw_img_id)
        for row in self._db.select(SEL_OPTICAL_IMAGE, ds.id):
            self._img_store.delete_image_by_id('optical_image', row[0])
        self._db.alter(DEL_DATASET_RAW_OPTICAL_IMAGE, ds.id)
        self._db.alter(DEL_OPTICAL_IMAGE, ds.id)

