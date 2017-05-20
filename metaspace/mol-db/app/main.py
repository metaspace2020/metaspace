import sys
from os.path import dirname
sys.path.append(dirname(dirname(__file__)))
import falcon

from app import log
from app.middleware import DatabaseSessionManager
from app.database import db_session, init_session
from app.api import base
from app.api import molecular_dbs
from app.api import molecules
from app.api import isotopic_pattern
from app.errors import AppError

LOG = log.get_logger()


class App(falcon.API):
    def __init__(self, *args, **kwargs):
        super(App, self).__init__(*args, **kwargs)
        LOG.info('API Server is starting')

        self.add_route('/', base.BaseResource())

        self.add_route('/v1/databases', molecular_dbs.MolDBCollection())
        self.add_route('/v1/databases/{db_id}', molecular_dbs.MolDBItem())
        self.add_route('/v1/databases/{db_id}/sfs', molecular_dbs.SumFormulaCollection())
        self.add_route('/v1/databases/{db_id}/molecules', molecular_dbs.MoleculeCollection())

        self.add_route('/v1/molecules/{mol_id}', molecules.MoleculeItem())

        self.add_route('/v1/isotopic_pattern/{ion}/{instr}/{res_power}/{at_mz}/{charge}',
                       isotopic_pattern.IsotopicPatternItem())

        # self.add_route('/v1/sfs', formulae.SumFormulaCollection())
        # self.add_route('/v1/sfs/{sf}/molecules', formulae.SumFormulaCollection())
        self.add_error_handler(AppError, AppError.handle)

init_session()
middleware = [
    # AuthHandler(), JSONTranslator(),
    DatabaseSessionManager(db_session)
]
application = App(middleware=middleware)


if __name__ == "__main__":
    from wsgiref import simple_server
    httpd = simple_server.make_server('127.0.0.1', 5001, application)
    httpd.serve_forever()
