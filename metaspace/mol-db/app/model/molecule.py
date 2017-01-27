from sqlalchemy import Column
from sqlalchemy import String, Integer, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from app.model.base import Base
from app.model import molecular_db_molecule


class Molecule(Base):
    __tablename__ = 'molecule'

    id = Column(Integer, primary_key=True)
    db_id = Column(String(30), nullable=False)
    name = Column(String(300), nullable=False)
    sf = Column(String(30), nullable=False)

    # many to many MolecularDB <-> Molecule
    molecular_dbs = relationship('MolecularDB',
                                 secondary=molecular_db_molecule,
                                 back_populates='molecules')

    def __repr__(self):
        return "<User(id='{}', db_id='{}', name = '{}', sf='{}')>".format(
            self.id, self.db_id, self.name, self.sf)

    @classmethod
    def get_id(cls):
        return Molecule.id

    # FIELDS = {
    #     'name': str,
    #     'version': str
    # }
    #
    # FIELDS.update(Base.FIELDS)
