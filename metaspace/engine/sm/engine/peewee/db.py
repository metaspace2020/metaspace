from peewee import Model, TextField, DateTimeField, DoubleField, BooleanField, SQL, IntegerField, ForeignKeyField, FloatField, BlobField
from playhouse.pool import PooledPostgresqlExtDatabase
from playhouse.postgres_ext import JSONField, ArrayField


db = PooledPostgresqlExtDatabase(None, autoconnect=False)


def init_db(config):
    db.init(**config)


class BaseModel(Model):
    class Meta:
        database = db


class DbDataset(BaseModel):
    class Meta:
        table_name = 'dataset'

    id = TextField(primary_key=True)
    name = TextField(index=True, null=True)
    input_path = TextField(null=True)
    metadata = JSONField(null=True)
    config = JSONField(null=True)
    upload_dt = DateTimeField(null=True)
    status = TextField(null=True)
    optical_image = TextField(null=True)
    transform = ArrayField(null=True, field_class=DoubleField)
    is_public = BooleanField(default=True)
    acq_geometry = JSONField(null=True)
    ion_img_storage_type = TextField(default='fs')
    thumbnail = TextField(null=True)
    ion_thumbnail = TextField(null=True)


class Job(BaseModel):
    class Meta:
        table_name = 'job'

    db_id = IntegerField(null=True)
    ds = ForeignKeyField(column_name='ds_id', field='id', model=DbDataset, null=True, backref='jobs')
    status = TextField(null=True)
    start = DateTimeField(null=True)
    finish = DateTimeField(null=True)


class Annotation(BaseModel):
    class Meta:
        table_name = 'annotation'
        indexes = (
            (('chem_mod', 'job', 'formula', 'neutral_loss', 'adduct'), True),
        )

    job = ForeignKeyField(column_name='job_id', field='id', model=Job, backref='annotations')
    formula = TextField()
    chem_mod = TextField()
    neutral_loss = TextField()
    adduct = TextField()
    msm = FloatField()
    fdr = FloatField()
    stats = JSONField()
    iso_image_ids = ArrayField(field_class=TextField)
    off_sample = JSONField(null=True)


class OpticalImage(BaseModel):
    class Meta:
        table_name = 'optical_image'

    id = TextField(primary_key=True)
    ds = ForeignKeyField(column_name='ds_id', field='id', model=DbDataset)
    type = TextField()
    zoom = FloatField()
    width = IntegerField()
    height = IntegerField()
    transform = ArrayField(field_class=FloatField)

