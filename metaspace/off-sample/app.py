import falcon

from off_sample.resources import PingResource, PredictResource
from off_sample.utils import logger


def create_app():
    api = falcon.API()
    api.add_route('/off-sample', PingResource())
    api.add_route('/off-sample/predict', PredictResource())
    return api


def get_app():
    return create_app()


if __name__ == '__main__':
    logger.info('Creating app...')
    app = get_app()
    from wsgiref import simple_server

    httpd = simple_server.make_server('0.0.0.0', 9876, app)
    logger.info('Running debug server...')
    httpd.serve_forever()
