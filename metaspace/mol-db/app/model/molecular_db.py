from sqlalchemy import Column
from sqlalchemy import String, Integer, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from app.model.base import Base
from app.model import molecular_db_molecule
from app.config import UUID_LEN
# from app.utils import alchemy


class MolecularDB(Base):
    __tablename__ = 'molecular_db'

    id = Column(Integer, primary_key=True)
    name = Column(String(30), nullable=False)
    version = Column(String(30), nullable=False)

    # intentionally assigned for user related service such as resetting password: kind of internal user secret key
    # sid = Column(String(UUID_LEN), nullable=False)

    # many to many MolecularDB <-> Molecule
    molecules = relationship('Molecule',
                             secondary=molecular_db_molecule,
                             back_populates='molecular_dbs')

    def __repr__(self):
        return "<User(id='%s', name='%s', version='%s')>" % \
            (self.id, self.name, self.version)

    @classmethod
    def get_id(cls):
        return MolecularDB.id

    @classmethod
    def find_by_name_version(cls, session, name, version):
        return session.query(MolecularDB).filter(MolecularDB.name == name &
                                                 MolecularDB.version == version).one()

    FIELDS = {
        'id': int,
        'name': str,
        'version': str
    }

    FIELDS.update(Base.FIELDS)
