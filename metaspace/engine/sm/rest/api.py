import argparse
import logging

import bottle

from sm.engine.util import GlobalInit
from sm.rest import isotopic_pattern, datasets, databases, imzml_browser, enrichment
from sm.rest.utils import make_response, OK, INTERNAL_ERROR

logger = logging.getLogger('api')

app = bottle.Bottle()
app.mount('/v1/datasets/', datasets.app)
app.mount('/v1/databases/', databases.app)
app.mount('/v1/enrichment/', enrichment.app)
app.mount('/v1/browser/', imzml_browser.app)


@app.get('/')
def root():
    return make_response(OK)


@app.get('/v1/isotopic_patterns/<ion>/<instr>/<res_power>/<at_mz>/<charge>')
def generate(ion, instr, res_power, at_mz, charge):
    try:
        pattern = isotopic_pattern.generate(ion, instr, res_power, at_mz, charge)
        return make_response(OK, data=pattern)
    except Exception as e:
        logger.warning(f'({ion}, {instr}, {res_power}, {at_mz}, {charge}) - {e}')
        return make_response(INTERNAL_ERROR)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SM Engine REST API')
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', type=str, help='SM config path'
    )
    args = parser.parse_args()

    with GlobalInit(args.config_path) as sm_config:
        datasets.init(sm_config)
        logger.info('Starting SM api')
        app.run(**sm_config['bottle'])
