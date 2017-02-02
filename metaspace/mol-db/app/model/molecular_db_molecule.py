from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.model.base import Base


class MolecularDBMolecule(Base):
    __tablename__ = 'molecular_db_molecule'

    db_id = Column(Integer, ForeignKey('molecular_db.id'), primary_key=True)
    inchikey = Column(String, ForeignKey('molecule.inchikey'), primary_key=True)
    mol_id = Column(String)
    mol_name = Column(String)

    molecule = relationship("Molecule", back_populates="assoc_molecular_dbs")
    molecular_db = relationship("MolecularDB", back_populates="assoc_molecules")

    FIELDS = {
        'inchikey': str,
        'db_id': int,
        'mol_id': str,
        'mol_name': str,
    }

    FIELDS.update(Base.FIELDS)
