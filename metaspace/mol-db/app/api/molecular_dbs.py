import re
import falcon

from sqlalchemy.orm.exc import NoResultFound
# from cerberus import Validator, ValidationError

from app import log
from app.api.base import BaseResource
# from app.utils.hooks import auth_required
# from app.utils.auth import encrypt_token, hash_password, verify_password, uuid
from app.errors import AppError, InvalidParameterError, ObjectNotExistsError, PasswordNotMatch
from app.model import MolecularDB, Molecule
from app.model import MolecularDBMolecule

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
        q = db_session.query(MolecularDBMolecule).filter(MolecularDBMolecule.db_id == db_id)
        if sf:
            tuples = (q.join(Molecule).filter(Molecule.sf == sf)
                      .with_entities(MolecularDBMolecule, Molecule).all())

        else:
            tuples = q.join(Molecule).with_entities(MolecularDBMolecule, Molecule).limit(limit).all()

        objs = [{**assoc_mol.to_dict(), **{'sf': mol.sf}}
                for assoc_mol, mol in tuples]
        self.on_success(res, objs)


class SumFormulaCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases/{db_id}/sfs
    """

    # @falcon.before(auth_required)
    def on_get(self, req, res, db_id):
        db_session = req.context['session']
        mol_db = db_session.query(MolecularDB).filter(MolecularDB.id == db_id).one()
        if mol_db:
            objs = list(set([mol.sf for mol in mol_db.molecules]))
            self.on_success(res, objs)
        else:
            raise AppError()


class MolDBCollection(BaseResource):
    """
    Handle for endpoint: /v1/databases
    """

    # @falcon.before(auth_required)
    def on_get(self, req, res):
        db_session = req.context['session']
        mol_dbs = db_session.query(MolecularDB).all()
        if mol_dbs:
            obj = [mol_db.to_dict() for mol_db in mol_dbs]
            self.on_success(res, obj)
        else:
            raise AppError()


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
            raise ObjectNotExistsError('user id: %s' % db_id)


# class Self(BaseResource):
#     """
#     Handle for endpoint: /v1/users/self
#     """
#     LOGIN = 'login'
#     RESETPW = 'resetpw'
#
#     def on_get(self, req, res):
#         cmd = re.split('\\W+', req.path)[-1:][0]
#         if cmd == Self.LOGIN:
#             self.process_login(req, res)
#         elif cmd == Self.RESETPW:
#             self.process_resetpw(req, res)
#
#     def process_login(self, req, res):
#         email = req.params['email']
#         password = req.params['password']
#         session = req.context['session']
#         try:
#             user_db = User.find_by_email(session, email)
#             if verify_password(password, user_db.password.encode('utf-8')):
#                 self.on_success(res, user_db.to_dict())
#             else:
#                 raise PasswordNotMatch()
#
#         except NoResultFound:
#             raise UserNotExistsError('User email: %s' % email)
#
#     @falcon.before(auth_required)
#     def process_resetpw(self, req, res):
#         pass