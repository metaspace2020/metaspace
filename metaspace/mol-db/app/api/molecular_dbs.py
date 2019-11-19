import logging
from io import StringIO

from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy import desc
import pandas as pd

from app.api.base import BaseResource
from app.moldb_import import import_molecules_from_df
from app.errors import ObjectNotExistError, BadRequestError
from app.model import MolecularDB, Molecule

logger = logging.getLogger('API')


class MoleculeCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}/molecules
    """

    def on_get(self, req, res, db_id):
        db_session = req.context['session']
        sf = req.params.get('sf', None)
        limit = req.params.get('limit', 100)
        fields = req.params.get('fields', None)

        q = db_session.query(Molecule).filter(Molecule.db_id == db_id)
        if sf:
            molecules = q.filter(Molecule.sf == sf).all()
        else:
            molecules = q.limit(limit).all()

        if fields:
            selector = self.field_selector(fields)
            objs = [selector(mol.to_dict()) for mol in molecules]
        else:
            objs = [mol.to_dict() for mol in molecules]

        if objs:
            self.on_success(res, objs)
        else:
            raise ObjectNotExistError('db_id: {}, sf: {}'.format(db_id, sf))

    def on_post(self, req, res, db_id):
        db = req.context['session']
        moldb = MolecularDB.find_by_id(db, db_id)
        if not moldb:
            raise BadRequestError(f'Mol DB does not exist: id={db_id}')

        buffer = StringIO(req.stream.read(req.content_length).decode())
        moldb_df = pd.read_csv(buffer, sep='\t')
        import_molecules_from_df(moldb, moldb_df)
        self.on_success(res)


class SumFormulaCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}/sfs
    """

    # @falcon.before(auth_required)
    def on_get(self, req, res, db_id):
        db_session = req.context['session']
        sf_tuples = (
            db_session.query(Molecule.sf).filter(Molecule.db_id == db_id).distinct('sf').all()
        )

        objs = [t[0] for t in sf_tuples]
        self.on_success(res, objs)


class MolDBCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases
    """

    def on_get(self, req, res):
        db = req.context['session']
        name = req.params.get('name', None)
        version = req.params.get('version', None)

        q = db.query(MolecularDB)
        if name:
            q = q.filter(MolecularDB.name == name)
        if version:
            q = q.filter(MolecularDB.version == version)

        mol_dbs = q.order_by(MolecularDB.name, desc(MolecularDB.version)).all()
        if mol_dbs:
            obj = [mol_db.to_dict() for mol_db in mol_dbs]
            self.on_success(res, obj)
        else:
            raise ObjectNotExistError('db_name: {}, db_version: {}'.format(name, version))

    def on_post(self, req, res):
        db = req.context['session']
        name = req.params.get('name', None)
        version = req.params.get('version', None)
        drop_moldb = req.params.get('drop', 'no').lower() in ['true', 'yes', '1']
        if not (name and version):
            BadRequestError(f'"Name" and "version" parameters required: {name}, {version}')

        moldb = MolecularDB.find_by_name_version(db, name, version)
        if moldb and not drop_moldb:
            raise BadRequestError(f'Mol DB already exists: {moldb}')

        if moldb:
            logger.info(f'Deleting Mol DB: {moldb}')
            db.delete(moldb)
            db.commit()
            moldb = MolecularDB(id=moldb.id, name=name, version=version)
        else:
            moldb = MolecularDB(name=name, version=version)
        db.add(moldb)
        db.commit()
        db.refresh(moldb)

        self.on_success(res, moldb.to_dict())


class MolDBItem(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}
    """

    def on_get(self, req, res, db_id):
        db = req.context['session']
        moldb = MolecularDB.find_by_id(db, db_id)
        if not moldb:
            raise BadRequestError(f'Mol DB does not exist: id={db_id}')

        self.on_success(res, moldb.to_dict())

    def on_delete(self, req, res, db_id):
        db = req.context['session']
        moldb = MolecularDB.find_by_id(db, db_id)
        db.delete(moldb)
        db.commit()
        self.on_success(res)
