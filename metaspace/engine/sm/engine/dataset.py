import json
import logging

from sm.engine.errors import SMError, UnknownDSID
from sm.engine.queue import SM_DS_STATUS

logger = logging.getLogger('sm-engine')


class DatasetStatus(object):
    """ Stage of dataset lifecycle """

    """ The dataset is just saved to the db """
    NEW = 'NEW'

    """ The dataset is queued for processing """
    QUEUED = 'QUEUED'

    """ The processing is in progress """
    STARTED = 'STARTED'

    """ The processing/reindexing finished successfully (most common) """
    FINISHED = 'FINISHED'

    """ An error occurred during processing """
    FAILED = 'FAILED'

    """ The records are being updated because of changed metadata """
    INDEXING = 'INDEXING'

    """ The dataset has been deleted """
    DELETED = 'DELETED'


class Dataset(object):
    """ Model class for representing a dataset """
    DS_SEL = 'SELECT name, input_path, upload_dt, metadata, config, status FROM dataset WHERE id = %s'
    DS_UPD = 'UPDATE dataset set name=%s, input_path=%s, upload_dt=%s, metadata=%s, config=%s, status=%s where id=%s'
    DS_CONFIG_SEL = 'SELECT config FROM dataset WHERE id = %s'
    DS_INSERT = ('INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status) '
                 'VALUES (%s, %s, %s, %s, %s, %s, %s)')

    ACQ_GEOMETRY_SEL = 'SELECT data FROM acquisition_geometry WHERE ds_id = %s'
    ACQ_GEOMETRY_INS = 'INSERT INTO acquisition_geometry (data, ds_id) VALUES (%s, %s)'
    ACQ_GEOMETRY_DEL = 'DELETE FROM acquisition_geometry WHERE ds_id = %s'

    acq_geometry_factory = None

    def __init__(self, id=None, name=None, input_path=None, upload_dt=None,
                 metadata=None, config=None, status=DatasetStatus.NEW):
        if Dataset.acq_geometry_factory is None:
            raise SMError('Mass spec acquisition geometry factory is not specified in sm-engine config.')

        self.id = id
        self.input_path = input_path
        self.upload_dt = upload_dt
        self.meta = metadata
        self.config = config
        self.status = status
        self.name = name or (metadata.get('metaspace_options', {}).get('Dataset_Name', id) if metadata else None)

    def __str__(self):
        return str(self.__dict__)

    def __eq__(self, other):
        return self.__dict__ == other.__dict__

    def set_status(self, db, es, queue=None, status=None):
        self.status = status
        self.save(db, es, queue)

    @classmethod
    def load(cls, db, ds_id):
        r = db.select_one(cls.DS_SEL, ds_id)
        if r:
            ds = Dataset(ds_id)
            ds.name, ds.input_path, ds.upload_dt, ds.meta, ds.config, ds.status = r
        else:
            raise UnknownDSID('Dataset does not exist: {}'.format(ds_id))
        return ds

    def is_stored(self, db):
        r = db.select_one(self.DS_SEL, self.id)
        return True if r else False

    def save(self, db, es, queue=None):
        assert self.id and self.name and self.input_path and self.upload_dt and self.config and self.status
        row = (self.id, self.name, self.input_path, self.upload_dt.isoformat(' '),
               json.dumps(self.meta), json.dumps(self.config), self.status)
        if not self.is_stored(db):
            db.insert(self.DS_INSERT, [row])
        else:
            db.alter(self.DS_UPD, *(row[1:] + row[:1]))  # ds_id goes last in DS_UPD
        logger.info("Inserted into dataset table: %s, %s", self.id, self.name)

        es.sync_dataset(self.id)
        if queue:
            queue.publish({'ds_id': self.id, 'status': self.status}, SM_DS_STATUS)

    def import_acq_geometry_from_file(self, db, ms_file_path):
        r = db.select_one(Dataset.ACQ_GEOMETRY_SEL, self.id)
        if r:
            db.alter(Dataset.ACQ_GEOMETRY_DEL, self.id)
        acq_geometry = Dataset.acq_geometry_factory(ms_file_path).create()
        db.insert(self.ACQ_GEOMETRY_INS, [(json.dumps(acq_geometry), self.id)])

    def to_queue_message(self):
        msg = {
            'ds_id': self.id,
            'ds_name': self.name,
            'input_path': self.input_path
        }
        if self.meta and self.meta.get('metaspace_options', {}).get('notify_submitter', True):
            email = self.meta.get('Submitted_By', {}).get('Submitter', {}).get('Email', None)
            if email:
                msg['user_email'] = email.lower()
        return msg
