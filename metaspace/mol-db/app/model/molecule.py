from sqlalchemy import MetaData, Table, Column, String, Integer, ForeignKey, join
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, column_property

from app.model.base import Base


moldb_mol_table = Table('molecular_db_molecule', Base.metadata,
                        Column('db_id', Integer, ForeignKey('molecular_db.id', ondelete="CASCADE"), primary_key=True),
                        Column('inchikey', String, ForeignKey('molecule.inchikey', ondelete="CASCADE"), primary_key=True),
                        Column('mol_id', String, nullable=False),
                        Column('mol_name', String))

molecule_table = Table('molecule', Base.metadata,
                       Column('inchikey', String, primary_key=True),
                       Column('inchi', String, nullable=False),
                       Column('sf', String, nullable=False))

moldb_mol_join = join(moldb_mol_table, molecule_table)


class Molecule(Base):
    __table__ = moldb_mol_join

    db_id = column_property(moldb_mol_table.c.db_id)
    inchikey = column_property(moldb_mol_table.c.inchikey, molecule_table.c.inchikey)
    inchi = molecule_table.c.inchi
    mol_id = moldb_mol_table.c.mol_id
    mol_name = moldb_mol_table.c.mol_name
    sf = molecule_table.c.sf

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
