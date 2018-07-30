import json
import logging

from sm.engine.errors import UnknownDSID

logger = logging.getLogger('engine')


class DatasetStatus(object):
    """ Stage of dataset lifecycle """

    """ The dataset is just saved to the db """
    NEW = 'NEW'

    """ The dataset is queued for processing """
    QUEUED = 'QUEUED'

    """ The processing is in progress """
    ANNOTATING = 'ANNOTATING'

    """ The records are being updated because of changed metadata """
    INDEXING = 'INDEXING'

    """ The processing/reindexing finished successfully (most common) """
    FINISHED = 'FINISHED'

    """ An error occurred during processing """
    FAILED = 'FAILED'

    """ The dataset has been deleted """
    DELETED = 'DELETED'  # only for the status queue


class Dataset(object):
    """ Model class for representing a dataset """
    DS_SEL = ('SELECT id, name, input_path, upload_dt, metadata, config, status, is_public, mol_dbs, adducts '
              'FROM dataset WHERE id = %s')
    DS_UPD = ('UPDATE dataset set name=%(name)s, input_path=%(input_path)s, upload_dt=%(upload_dt)s, '
              'metadata=%(metadata)s, config=%(config)s, status=%(status)s, is_public=%(is_public)s, '
              'mol_dbs=%(mol_dbs)s, adducts=%(adducts)s where id=%(id)s')
    DS_CONFIG_SEL = 'SELECT config FROM dataset WHERE id = %s'
    DS_INSERT = ('INSERT INTO dataset (id, name, input_path, upload_dt, metadata, config, status, '
                 'is_public, mol_dbs, adducts) '
                 'VALUES (%(id)s, %(name)s, %(input_path)s, %(upload_dt)s, %(metadata)s, %(config)s, %(status)s, '
                 '%(is_public)s, %(mol_dbs)s, %(adducts)s)')

    ACQ_GEOMETRY_SEL = 'SELECT acq_geometry FROM dataset WHERE id = %s'
    ACQ_GEOMETRY_UPD = 'UPDATE dataset SET acq_geometry = %s WHERE id = %s'
    IMG_STORAGE_TYPE_SEL = 'SELECT ion_img_storage_type FROM dataset WHERE id = %s'
    IMG_STORAGE_TYPE_UPD = 'UPDATE dataset SET ion_img_storage_type = %s WHERE id = %s'

    def __init__(self, id=None, name=None, input_path=None, upload_dt=None,
                 metadata=None, config=None, status=DatasetStatus.NEW,
                 is_public=True, mol_dbs=None, adducts=None, img_storage_type='fs'):
        self.id = id
        self.name = name
        self.input_path = input_path
        self.upload_dt = upload_dt
        self.metadata = metadata
        self.config = config
        self.status = status
        self.is_public = is_public
        self.mol_dbs = mol_dbs
        self.adducts = adducts
        self.ion_img_storage_type = img_storage_type

    def __str__(self):
        return str(self.__dict__)

    def __eq__(self, other):
        return self.__dict__ == other.__dict__

    def set_status(self, db, es, status_queue=None, status=None):
        self.status = status
        self.save(db, es, status_queue)

    @classmethod
    def load(cls, db, ds_id):
        docs = db.select_with_fields(cls.DS_SEL, params=(ds_id,))
        if docs:
            return Dataset(**docs[0])
            # ds.name, ds.input_path, ds.upload_dt, ds.metadata, ds.config, ds.status, ds.is_public, ds.mol_dbs = r
        else:
            raise UnknownDSID('Dataset does not exist: {}'.format(ds_id))

    def is_stored(self, db):
        r = db.select_one(self.DS_SEL, params=(self.id,))
        return True if r else False

    def save(self, db, es, status_queue=None):
        assert self.id and self.name and self.input_path and self.upload_dt and self.config and self.status \
               and self.is_public is not None
        doc = {
            'id': self.id,
            'name': self.name,
            'input_path': self.input_path,
            'upload_dt': self.upload_dt,
            'metadata': json.dumps(self.metadata),
            'config': json.dumps(self.config),
            'status': self.status,
            'is_public': self.is_public,
            'mol_dbs': self.mol_dbs,
            'adducts': self.adducts
        }
        if not self.is_stored(db):
            db.insert(self.DS_INSERT, rows=[doc])
        else:
            db.alter(self.DS_UPD, params=doc)
        logger.info("Inserted into dataset table: %s, %s", self.id, self.name)

        es.sync_dataset(self.id)
        if status_queue:
            status_queue.publish({'ds_id': self.id, 'status': self.status})

    def get_acq_geometry(self, db):
        r = db.select_one(Dataset.ACQ_GEOMETRY_SEL, params=(self.id,))
        if not r:
            raise UnknownDSID('Dataset does not exist: {}'.format(self.id))
        return r[0]

    def save_acq_geometry(self, db, acq_geometry):
        db.alter(self.ACQ_GEOMETRY_UPD, params=(json.dumps(acq_geometry), self.id))

    def get_ion_img_storage_type(self, db):
        if not self.ion_img_storage_type:
            r = db.select_one(Dataset.IMG_STORAGE_TYPE_SEL, params=(self.id,))
            if not r:
                raise UnknownDSID('Dataset does not exist: {}'.format(self.id))
            self.ion_img_storage_type = r[0]
        return self.ion_img_storage_type

    def save_ion_img_storage_type(self, db, storage_type):
        db.alter(self.IMG_STORAGE_TYPE_UPD, params=(storage_type, self.id))
        self.ion_img_storage_type = storage_type

    def to_queue_message(self):
        msg = {
            'ds_id': self.id,
            'ds_name': self.name,
            'input_path': self.input_path
        }
        email = self.metadata.get('Submitted_By', {}).get('Submitter', {}).get('Email', None)
        if email:
            msg['user_email'] = email.lower()
        return msg
