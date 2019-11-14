import logging
from io import StringIO

from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy import desc
import pandas as pd

from app.api.base import BaseResource
from app.moldb_import import import_molecular_database
from app.errors import ObjectNotExistError, BadRequestError
from app.model import MolecularDB, Molecule

logger = logging.getLogger('API')


class MoleculeCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}/molecules?sf=<SF>
    """

    # @falcon.before(auth_required)
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
        name = req.params.get('name', None)
        version = req.params.get('version', None)
        drop_moldb = req.params.get('drop', 'no').lower() in ['true', 'yes', '1']
        if not (name and version):
            BadRequestError(f'"Name" and "version" parameters required: {name}, {version}')

        buffer = StringIO(req.stream.read(req.content_length).decode())
        moldb_df = pd.read_csv(buffer, sep='\t')

        moldb = import_molecular_database(name, version, moldb_df, drop_moldb=drop_moldb)
        self.on_success(res, moldb.to_dict())


class MolDBItem(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}
    """

    def on_get(self, req, res, db_id):
        session = req.context['session']
        try:
            moldb = MolecularDB.find_by_id(session, db_id)
            self.on_success(res, moldb.to_dict())
        except NoResultFound:
            raise ObjectNotExistError('user id: %s' % db_id)

    def on_delete(self, req, res, db_id):
        db = req.context['session']
        moldb = MolecularDB.find_by_id(db, db_id)
        db.delete(moldb)
        db.commit()
        self.on_success(res)
