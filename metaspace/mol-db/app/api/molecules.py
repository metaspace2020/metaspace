from sqlalchemy.orm.exc import NoResultFound

from app.api.base import BaseResource

from app.errors import ObjectNotExistError
from app.model import Molecule


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
