import re
import falcon

from sqlalchemy.orm.exc import NoResultFound
# from cerberus import Validator, ValidationError

from app import log
from app.api.base import BaseResource
# from app.utils.hooks import auth_required
# from app.utils.auth import encrypt_token, hash_password, verify_password, uuid
from app.errors import AppError, InvalidParameterError, ObjectNotExistError, PasswordNotMatch
from app.model import MolecularDB, Molecule

LOG = log.get_logger()


# class MoleculeCollection(BaseResource):
#     """
#     Handle for endpoint: /v1/molecules
#     """
#
#     # @falcon.before(auth_required)
#     def on_get(self, req, res):
#         db_session = req.context['session']
#         req.param
#         mol_db = db_session.query(MolecularDB).filter(MolecularDB.id == db_id).one()
#         if mol_db:
#             objs = [mol.to_dict() for mol in mol_db.molecules]
#             self.on_success(res, objs)
#         else:
#             raise AppError()


class MoleculeItem(BaseResource):
    """
    Handle for endpoint: /v1/molecules/{mol_id}
    """
    # @falcon.before(auth_required)
    def on_get(self, req, res, mol_id):
        db_session = req.context['session']
        try:
            molecule = db_session.query(Molecule).filter(Molecule.mol_id == mol_id).one()
            self.on_success(res, molecule.to_dict())
        except NoResultFound:
            raise ObjectNotExistError('molecule id: %s' % mol_id)


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