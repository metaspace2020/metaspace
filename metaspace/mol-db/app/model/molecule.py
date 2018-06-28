from sqlalchemy import MetaData, Table, Column, String, Integer, ForeignKey

from app.model.base import Base


class Molecule(Base):
    __tablename__ = 'molecule'

    db_id = Column(Integer, ForeignKey('molecular_db.id', ondelete='CASCADE'), primary_key=True)
    inchikey = Column(String, primary_key=True)
    inchi = Column(String, nullable=False)
    mol_id = Column(String, nullable=False)
    mol_name = Column(String)
    sf = Column(String, nullable=False)

    # moldb = relationship('MolecularDB', back_populates='molecules')

    def __repr__(self):
        return "<Molecule(inchikey='{}', mol_id = '{}', mol_name = '{}', sf='{}', db_id='{}')>".format(
            self.inchikey, self.mol_id, self.mol_name, self.sf, self.db_id)

    @classmethod
    def get_id(cls):
        return Molecule.inchikey

    FIELDS = {
        'db_id': int,
        'mol_id': str,
        'mol_name': str,
        'inchikey': str,
        'inchi': str,
        'sf': str
    }

    FIELDS.update(Base.FIELDS)
