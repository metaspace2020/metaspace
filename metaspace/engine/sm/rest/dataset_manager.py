import logging
from datetime import datetime

from sm.engine import molecular_db
from sm.engine.dataset import (
    DatasetStatus,
    Dataset,
    generate_ds_config,
    update_ds_config,
    FLAT_DS_CONFIG_KEYS,
)
from sm.engine.errors import DSIsBusy, UnknownDSID
from sm.engine.daemons.actions import DaemonAction, DaemonActionStage
from sm.engine.optical_image import add_optical_image, del_optical_image
from sm.engine.config import SMConfig


class DatasetActionPriority:
    """ Priorities used for messages sent to queue """

    LOW = 0
    STANDARD = 1
    HIGH = 2
    DEFAULT = STANDARD


class SMapiDatasetManager:
    def __init__(
        self,
        db,
        es,
        logger=None,
        annot_queue=None,
        update_queue=None,
        lit_queue=None,
        status_queue=None,
    ):
        self._sm_config = SMConfig.get_conf()
        self._db = db
        self._es = es
        self._annot_queue = annot_queue
        self._update_queue = update_queue
        self._lit_queue = lit_queue
        self._status_queue = status_queue
        self.logger = logger or logging.getLogger()

    def _set_ds_busy(self, ds, ignore_status=False):
        if ds.status in {DatasetStatus.QUEUED, DatasetStatus.ANNOTATING} and not ignore_status:
            raise DSIsBusy(ds.id)

        ds.set_status(self._db, self._es, DatasetStatus.QUEUED)

    def _post_sm_msg(self, ds, queue, priority=DatasetActionPriority.DEFAULT, **kwargs):
        msg = {'ds_id': ds.id, 'ds_name': ds.name}
        msg.update(kwargs)

        queue.publish(msg, priority)
        self.logger.info(f'New message posted to {queue}: {msg}')

    @staticmethod
    def _add_default_moldbs(moldb_ids):
        default_moldb_ids = [moldb.id for moldb in molecular_db.find_default()]
        return list(set(moldb_ids) | set(default_moldb_ids))

    def add(self, doc, use_lithops, **kwargs):
        """Save dataset and send ANNOTATE message to the queue."""
        now = datetime.now()
        if 'id' not in doc:
            doc['id'] = now.strftime('%Y-%m-%d_%Hh%Mm%Ss')

        ds_config_kwargs = dict((k, v) for k, v in doc.items() if k in FLAT_DS_CONFIG_KEYS)

        try:
            ds = Dataset.load(self._db, doc['id'])
            self._set_ds_busy(ds, kwargs.get('force', False))
            config = update_ds_config(ds.config, doc['metadata'], **ds_config_kwargs)
        except UnknownDSID:
            config = generate_ds_config(doc.get('metadata'), **ds_config_kwargs)

        ds = Dataset(
            id=doc['id'],
            name=doc.get('name'),
            input_path=doc.get('input_path'),
            upload_dt=doc.get('upload_dt', now.isoformat()),
            metadata=doc.get('metadata'),
            config=config,
            is_public=doc.get('is_public'),
            status=DatasetStatus.QUEUED,
        )
        ds.save(self._db, self._es, allow_insert=True)
        self._status_queue.publish(
            {'ds_id': ds.id, 'action': DaemonAction.ANNOTATE, 'stage': DaemonActionStage.QUEUED}
        )

        queue = self._lit_queue if use_lithops else self._annot_queue
        self._post_sm_msg(ds=ds, queue=queue, action=DaemonAction.ANNOTATE, **kwargs)
        return doc['id']

    def delete(self, ds_id, **kwargs):
        """ Send delete message to the queue """
        ds = Dataset.load(self._db, ds_id)
        self._set_ds_busy(ds, kwargs.get('force', False))
        self._post_sm_msg(ds=ds, queue=self._update_queue, action=DaemonAction.DELETE, **kwargs)

    def update(self, ds_id, doc, async_es_update, **kwargs):
        """ Save dataset and send update message to the queue """
        ds = Dataset.load(self._db, ds_id)
        ds.name = doc.get('name', ds.name)
        ds.input_path = doc.get('input_path', ds.input_path)
        if 'metadata' in doc:
            ds.metadata = doc['metadata']
        ds.upload_dt = doc.get('upload_dt', ds.upload_dt)
        ds.is_public = doc.get('is_public', ds.is_public)
        ds.save(self._db, None if async_es_update else self._es)

        self._post_sm_msg(
            ds=ds,
            queue=self._update_queue,
            action=DaemonAction.UPDATE,
            fields=list(doc.keys()),
            **kwargs,
        )

    def add_optical_image(self, ds_id, url, transform, zoom_levels=(1, 2, 4, 8)):
        """Add optical image to dataset.

        Generates scaled and transformed versions of the provided optical image
        + creates the thumbnail
        """
        add_optical_image(self._db, ds_id, url, transform, zoom_levels)

    def del_optical_image(self, ds_id):
        """Delete raw and zoomed optical images from DB and FS."""

        del_optical_image(self._db, ds_id)
