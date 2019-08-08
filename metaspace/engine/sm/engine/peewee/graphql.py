from peewee import TextField, DateTimeField, BooleanField, SQL, IntegerField, ForeignKeyField, FloatField, DecimalField, CompositeKey
from playhouse.postgres_ext import ArrayField

from .db import BaseModel, DbDataset


class ColocJob(BaseModel):
    class Meta:
        table_name = 'coloc_job'
        schema = 'graphql'

    id = TextField(constraints=[SQL("DEFAULT 'uuid_generate_v1mc()'")], primary_key=True)
    ds_id = TextField()
    mol_db = TextField(null=True)
    fdr = DecimalField()
    algorithm = TextField()
    start = DateTimeField(constraints=[SQL("DEFAULT timezone('utc'::text, now())")])
    finish = DateTimeField(constraints=[SQL("DEFAULT timezone('utc'::text, now())")])
    error = TextField(null=True)
    sample_ion_ids = ArrayField(field_class=IntegerField)


class ColocAnnotation(BaseModel):
    class Meta:
        table_name = 'coloc_annotation'
        indexes = (
            (('coloc_job', 'ion_id'), True),
        )
        schema = 'graphql'
        primary_key = CompositeKey('coloc_job', 'ion_id')

    coloc_job = ForeignKeyField(column_name='coloc_job_id', field='id', model=ColocJob)
    ion_id = IntegerField()
    coloc_ion_ids = ArrayField(field_class=IntegerField)
    coloc_coeffs = ArrayField(field_class=FloatField)


class Credentials(BaseModel):
    class Meta:
        table_name = 'credentials'
        schema = 'graphql'

    id = TextField(constraints=[SQL("DEFAULT 'uuid_generate_v1mc()'")], primary_key=True)
    hash = TextField(null=True)
    google_id = TextField(null=True)
    email_verification_token = TextField(null=True)
    email_verification_token_expires = DateTimeField(null=True)
    email_verified = BooleanField(default=False)
    reset_password_token = TextField(null=True)
    reset_password_token_expires = DateTimeField(null=True)


class Group(BaseModel):
    class Meta:
        table_name = 'group'
        schema = 'graphql'

    id = TextField(constraints=[SQL("DEFAULT 'uuid_generate_v1mc()'")], primary_key=True)
    name = TextField()
    short_name = TextField()
    url_slug = TextField(null=True)
    group_description = TextField(default='')


class User(BaseModel):
    class Meta:
        table_name = 'user'
        schema = 'graphql'

    id = TextField(constraints=[SQL("DEFAULT 'uuid_generate_v1mc()'")], primary_key=True)
    name = TextField(null=True)
    email = TextField(null=True)
    not_verified_email = TextField(null=True)
    role = TextField(default='user')
    credentials = ForeignKeyField(column_name='credentials_id', field='id', model=Credentials, unique=True)


class GqlDataset(BaseModel):
    class Meta:
        table_name = 'dataset'
        schema = 'graphql'

    id = TextField(primary_key=True)
    user = ForeignKeyField(column_name='user_id', field='id', model=User, backref='gql_dataset')
    group = ForeignKeyField(column_name='group_id', field='id', model=Group, null=True, backref='gql_dataset')
    group_approved = BooleanField(default=False)
    pi_name = TextField(null=True)
    pi_email = TextField(null=True)


class Project(BaseModel):
    class Meta:
        table_name = 'project'
        schema = 'graphql'

    id = TextField(constraints=[SQL("DEFAULT 'uuid_generate_v1mc()'")], primary_key=True)
    name = TextField()
    url_slug = TextField(null=True)
    is_public = BooleanField(default=True)
    created_dt = DateTimeField(constraints=[SQL("DEFAULT timezone('utc'::text, now())")])
    project_description = TextField(default='')


class DatasetProject(BaseModel):
    class Meta:
        table_name = 'dataset_project'
        indexes = (
            (('dataset', 'project'), True),
        )
        schema = 'graphql'
        primary_key = CompositeKey('dataset', 'project')

    dataset = ForeignKeyField(column_name='dataset_id', field='id', model=GqlDataset, backref='dataset_projects')
    project = ForeignKeyField(column_name='project_id', field='id', model=Project, backref='dataset_projects')
    approved = BooleanField()


class Ion(BaseModel):
    class Meta:
        table_name = 'ion'
        indexes = (
            (('adduct', 'chem_mod', 'neutral_loss', 'formula', 'charge'), True),
        )
        schema = 'graphql'

    ion = TextField(index=True)
    formula = TextField()
    adduct = TextField()
    charge = IntegerField()
    chem_mod = TextField(constraints=[SQL("DEFAULT ''::text")])
    neutral_loss = TextField(constraints=[SQL("DEFAULT ''::text")])


class UserGroup(BaseModel):
    class Meta:
        table_name = 'user_group'
        indexes = (
            (('user', 'group'), True),
        )
        schema = 'graphql'
        primary_key = CompositeKey('group', 'user')

    user = ForeignKeyField(column_name='user_id', field='id', model=User, backref='user_groups')
    group = ForeignKeyField(column_name='group_id', field='id', model=Group, backref='user_groups')
    role = TextField()
    primary = BooleanField(constraints=[SQL("DEFAULT true")])


class UserProject(BaseModel):
    class Meta:
        table_name = 'user_project'
        indexes = (
            (('user', 'project'), True),
        )
        schema = 'graphql'
        primary_key = CompositeKey('project', 'user')

    user = ForeignKeyField(column_name='user_id', field='id', model=User, backref='user_projects')
    project = ForeignKeyField(column_name='project_id', field='id', model=Project, backref='user_projects')
    role = TextField()


