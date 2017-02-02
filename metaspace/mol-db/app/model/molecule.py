from sqlalchemy import Column
from sqlalchemy import String, Integer, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from app.model.base import Base
from app.model import molecular_db_molecule


class Molecule(Base):
    __tablename__ = 'molecule'

    inchikey = Column(String, primary_key=True)
    inchi = Column(String, nullable=False)
    sf = Column(String, nullable=False)

    assoc_molecular_dbs = relationship("MolecularDBMolecule", back_populates="molecule")

    def __repr__(self):
        return "<User(inchikey='{}', name = '{}', sf='{}')>".format(
            self.inchikey, self.name, self.sf)

    @classmethod
    def get_id(cls):
        return Molecule.inchikey

    FIELDS = {
        'inchikey': str,
        'inchi': str,
        'sf': str
    }

    FIELDS.update(Base.FIELDS)
