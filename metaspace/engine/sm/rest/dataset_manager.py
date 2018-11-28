import io
import logging
from datetime import datetime
import numpy as np
from PIL import Image

from sm.engine.dataset import DatasetStatus, Dataset
from sm.engine.errors import DSIsBusy, UnknownDSID
from sm.engine.daemon_action import DaemonAction, DaemonActionStage
from sm.engine.util import SMConfig

SEL_DATASET_RAW_OPTICAL_IMAGE = 'SELECT optical_image from dataset WHERE id = %s'
UPD_DATASET_RAW_OPTICAL_IMAGE = 'update dataset set optical_image = %s, transform = %s WHERE id = %s'
DEL_DATASET_RAW_OPTICAL_IMAGE = 'update dataset set optical_image = NULL, transform = NULL WHERE id = %s'
UPD_DATASET_THUMB_OPTICAL_IMAGE = 'update dataset set thumbnail = %s WHERE id = %s'

IMG_URLS_BY_ID_SEL = ('SELECT iso_image_ids '
                      'FROM iso_image_metrics m '
                      'JOIN job j ON j.id = m.job_id '
                      'JOIN dataset d ON d.id = j.ds_id '
                      'WHERE ds_id = %s')

INS_OPTICAL_IMAGE = 'INSERT INTO optical_image (id, ds_id, zoom) VALUES (%s, %s, %s)'
SEL_OPTICAL_IMAGE = 'SELECT id FROM optical_image WHERE ds_id = %s'
SEL_OPTICAL_IMAGE_THUMBNAIL = 'SELECT thumbnail FROM dataset WHERE id = %s'
DEL_OPTICAL_IMAGE = 'DELETE FROM optical_image WHERE ds_id = %s'


class DatasetActionPriority(object):
    """ Priorities used for messages sent to queue """
    LOW = 0
    STANDARD = 1
    HIGH = 2
    DEFAULT = STANDARD


class SMapiDatasetManager(object):

    def __init__(self, db, es, image_store, logger=None,
                 annot_queue=None, update_queue=None, status_queue=None):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self._img_store = image_store
        self._status_queue = status_queue
        self._annot_queue = annot_queue
        self._update_queue = update_queue
        self.logger = logger or logging.getLogger()

    def _set_ds_busy(self, ds, ignore_status=False):
        if ds.status in {DatasetStatus.QUEUED,
                         DatasetStatus.ANNOTATING} and not ignore_status:
            raise DSIsBusy(ds.id)

        ds.update_status(self._db, self._es, DatasetStatus.QUEUED)

    def _post_sm_msg(self, ds, queue, priority=DatasetActionPriority.DEFAULT, **kwargs):
        msg = {
            'ds_id': ds.id,
            'ds_name': ds.name
        }
        msg.update(kwargs)

        queue.publish(msg, priority)
        self.logger.info('New message posted to %s: %s', queue, msg)

    def add(self, doc, **kwargs):
        """ Save dataset and send add message to the queue """
        now = datetime.now()
        if 'id' not in doc:
            doc['id'] = now.strftime('%Y-%m-%d_%Hh%Mm%Ss')

        try:
            ds = Dataset.load(self._db, doc['id'])
            self._set_ds_busy(ds, kwargs.get('force', False))
            is_new = True
        except UnknownDSID:
            is_new = False

        ds = Dataset(id=doc['id'],
                     name=doc.get('name'),
                     input_path=doc.get('input_path'),
                     upload_dt=doc.get('upload_dt', now.isoformat()),
                     metadata=doc.get('metadata'),
                     is_public=doc.get('is_public'),
                     mol_dbs=doc.get('mol_dbs'),
                     adducts=doc.get('adducts'),
                     status=DatasetStatus.QUEUED)
        ds.save(self._db, self._es)
        ds.notify_update(self._update_queue, DaemonAction.ANNOTATE, DaemonActionStage.QUEUED, is_new=is_new)

        self._post_sm_msg(ds=ds, queue=self._annot_queue, action=DaemonAction.ANNOTATE, **kwargs)
        return doc['id']

    def delete(self, ds_id, **kwargs):
        """ Delete optical images and send delete message to the queue """
        ds = Dataset.load(self._db, ds_id)
        self._set_ds_busy(ds, kwargs.get('force', False))
        self.del_optical_image(ds_id, **kwargs)
        self._post_sm_msg(ds=ds, queue=self._update_queue, action=DaemonAction.DELETE, **kwargs)

    def update(self, ds_id, doc, **kwargs):
        """ Save dataset and send update message to the queue """
        ds = Dataset.load(self._db, ds_id)
        ds.name = doc.get('name', ds.name)
        ds.input_path = doc.get('input_path', ds.input_path)
        if 'metadata' in doc:
            ds.metadata = doc['metadata']
        ds.upload_dt = doc.get('upload_dt', ds.upload_dt)
        ds.is_public = doc.get('is_public', ds.is_public)
        ds.save(self._db, self._es)

        self._post_sm_msg(ds=ds, queue=self._update_queue,
                          action=DaemonAction.UPDATE, fields=list(doc.keys()), **kwargs)

    def _annotation_image_shape(self, ds):
        self.logger.info('Querying annotation image shape for "%s" dataset...', ds.id)
        ion_img_id = self._db.select(IMG_URLS_BY_ID_SEL + ' LIMIT 1', params=(ds.id,))[0][0][0]
        storage_type = ds.get_ion_img_storage_type(self._db)
        result = self._img_store.get_image_by_id(storage_type, 'iso_image', ion_img_id).size
        self.logger.info('Annotation image shape for "{}" dataset is {}'.format(ds.id, result))
        return result

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
        row = self._db.select_one(SEL_DATASET_RAW_OPTICAL_IMAGE, params=(ds.id,))
        if row:
            old_img_id = row[0]
            if old_img_id and old_img_id != img_id:
                self._img_store.delete_image_by_id('fs', 'raw_optical_image', old_img_id)
        self._db.alter(UPD_DATASET_RAW_OPTICAL_IMAGE, params=(img_id, transform, ds.id))

    def _add_zoom_optical_images(self, ds, img_id, transform, zoom_levels):
        dims = self._annotation_image_shape(ds)
        rows = []
        optical_img = self._img_store.get_image_by_id('fs', 'raw_optical_image', img_id)
        for zoom in zoom_levels:
            img = self._transform_scan(optical_img, transform, dims, zoom)
            buf = self._save_jpeg(img)
            scaled_img_id = self._img_store.post_image('fs', 'optical_image', buf)
            rows.append((scaled_img_id, ds.id, zoom))

        for row in self._db.select(SEL_OPTICAL_IMAGE, params=(ds.id,)):
            self._img_store.delete_image_by_id('fs', 'optical_image', row[0])
        self._db.alter(DEL_OPTICAL_IMAGE, params=(ds.id,))
        self._db.insert(INS_OPTICAL_IMAGE, rows=rows)

    def _add_thumbnail_optical_image(self, ds, img_id, transform):
        size = 200, 200
        self._db.alter(UPD_DATASET_THUMB_OPTICAL_IMAGE, params=(None, ds.id,))
        dims = self._annotation_image_shape(ds)
        optical_img = self._img_store.get_image_by_id('fs', 'raw_optical_image', img_id)
        img = self._transform_scan(optical_img, transform, dims, zoom=1)
        img.thumbnail(size, Image.ANTIALIAS)
        buf = self._save_jpeg(img)
        img_thumb_id = self._img_store.post_image('fs', 'optical_image', buf)
        self._db.alter(UPD_DATASET_THUMB_OPTICAL_IMAGE, params=(img_thumb_id, ds.id,))

    def add_optical_image(self, ds_id, img_id, transform, zoom_levels=[1, 2, 4, 8], **kwargs):
        """ Generate scaled and transformed versions of the provided optical image + creates the thumbnail """
        ds = Dataset.load(self._db, ds_id)
        self.logger.info('Adding optical image to "%s" dataset', ds.id)
        self._add_raw_optical_image(ds, img_id, transform)
        self._add_zoom_optical_images(ds, img_id, transform, zoom_levels)
        self._add_thumbnail_optical_image(ds, img_id, transform)

    def del_optical_image(self, ds_id, **kwargs):
        """ Deletes raw and zoomed optical images from DB and FS"""
        ds = Dataset.load(self._db, ds_id)
        self.logger.info('Deleting optical image to "%s" dataset', ds.id)
        row = self._db.select_one(SEL_DATASET_RAW_OPTICAL_IMAGE, params=(ds.id,))
        if row:
            raw_img_id = row[0]
            if raw_img_id:
                self._img_store.delete_image_by_id('fs', 'raw_optical_image', raw_img_id)
        for row in self._db.select(SEL_OPTICAL_IMAGE, params=(ds.id,)):
            self._img_store.delete_image_by_id('fs', 'optical_image', row[0])
        (img_id,) = self._db.select_one(SEL_OPTICAL_IMAGE_THUMBNAIL, params=(ds.id,))
        if img_id:
            self._img_store.delete_image_by_id('fs', 'optical_image', img_id)
        self._db.alter(DEL_DATASET_RAW_OPTICAL_IMAGE, params=(ds.id,))
        self._db.alter(DEL_OPTICAL_IMAGE, params=(ds.id,))
        self._db.alter(UPD_DATASET_THUMB_OPTICAL_IMAGE, params=(None, ds.id,))
