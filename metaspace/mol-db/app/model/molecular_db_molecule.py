from sqlalchemy import Column
from sqlalchemy import ForeignKey
from sqlalchemy import Table, Text

from app.model.base import Base

molecular_db_molecule = Table('molecular_db_molecule', Base.metadata,
    Column('db_id', ForeignKey('molecular_db.id'), primary_key=True),
    Column('m_id', ForeignKey('molecule.id'), primary_key=True)
)