import re
import falcon

from sqlalchemy.orm.exc import NoResultFound
from sqlalchemy import desc
# from cerberus import Validator, ValidationError

from app import log
from app.api.base import BaseResource
from app.errors import AppError, InvalidParameterError, ObjectNotExistError, PasswordNotMatch
from app.model import MolecularDB, Molecule

LOG = log.get_logger()


# FIELDS = {
#     'username': {
#         'type': 'string',
#         'required': True,
#         'minlength': 4,
#         'maxlength': 20
#     },
#     'email': {
#         'type': 'string',
#         'regex': '[a-zA-Z0-9._-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,4}',
#         'required': True,
#         'maxlength': 320
#     },
#     'password': {
#         'type': 'string',
#         'regex': '[0-9a-zA-Z]\w{3,14}',
#         'required': True,
#         'minlength': 8,
#         'maxlength': 64
#     },
#     'info': {
#         'type': 'dict',
#         'required': False
#     }
# }
#
#
# def validate_user_create(req, res, resource, params):
#     schema = {
#         'username': FIELDS['username'],
#         'email': FIELDS['email'],
#         'password': FIELDS['password'],
#         'info': FIELDS['info']
#     }
#
#     v = Validator(schema)
#     try:
#         if not v.validate(req.context['data']):
#             raise InvalidParameterError(v.errors)
#     except ValidationError:
#         raise InvalidParameterError('Invalid Request %s' % req.context)


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
        sf_tuples = (db_session.query(Molecule.sf)
                     .filter(Molecule.db_id == db_id)
                     .distinct('sf').all())

        objs = [t[0] for t in sf_tuples]
        self.on_success(res, objs)


class MolDBCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases
    """

    # @falcon.before(auth_required)
    def on_get(self, req, res):
        db_session = req.context['session']
        name = req.params.get('name', None)
        version = req.params.get('version', None)

        q = db_session.query(MolecularDB)
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


class MolDBItem(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}
    """
    # @falcon.before(auth_required)
    def on_get(self, req, res, db_id):
        session = req.context['session']
        try:
            user_db = MolecularDB.find_one(session, db_id)
            self.on_success(res, user_db.to_dict())
        except NoResultFound:
            raise ObjectNotExistError('user id: %s' % db_id)
