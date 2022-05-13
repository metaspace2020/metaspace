import argparse
import logging

import json
import numpy as np
import pandas as pd
from scipy.stats import fisher_exact
from statsmodels.stats import multitest

import bottle

from sm.engine.util import GlobalInit
from sm.rest import isotopic_pattern, datasets, databases
from sm.rest.utils import make_response, OK, INTERNAL_ERROR

logger = logging.getLogger('api')

app = bottle.Bottle()
app.mount('/v1/datasets/', datasets.app)
app.mount('/v1/databases/', databases.app)


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


@app.post('/v1/calculate_enrichment')
def calculate_enrichment():
    try:
        body = json.loads(bottle.request.body.read().decode('utf-8'))
        enrichment_sets = body['enrichedSets']
        bootstrapped_sublist = body['bootstrappedSublist']
        terms_hash = body['termsHash']
        enrichment_analysis_input = {}
        for key in enrichment_sets.keys():
            db_items = set(enrichment_sets[key])
            enrichment_analysis_input[key] = {}
            enrichment_analysis_input[key]['background'] = len(enrichment_sets[key])
            enrichment_analysis_input[key]['sublist'] = []
            for bootstrap_item in bootstrapped_sublist:
                items_sum = len(db_items.intersection(set(bootstrap_item.values())))
                enrichment_analysis_input[key]['sublist'].append(items_sum)

        data = []

        for key in enrichment_analysis_input.keys():
            if key == 'all':
                continue

            observed = np.median(enrichment_analysis_input[key]['sublist']) / np.median(
                enrichment_analysis_input['all']['sublist'])
            expected = enrichment_analysis_input[key]['background'] \
                       / enrichment_analysis_input['all']['background']
            fold_enrichment_median = observed / expected  ## median fold enrichment
            fold_enrichment_sd = np.std((np.array(enrichment_analysis_input[key]['sublist'])
                                         / np.array(
                        enrichment_analysis_input['all']['sublist'])) / expected)
            _, pvalue = fisher_exact([
                [
                    np.median(enrichment_analysis_input[key]['sublist']),
                    np.median(enrichment_analysis_input['all']['sublist'])],
                [enrichment_analysis_input[key]['background'],
                 enrichment_analysis_input['all']['background']]
            ],
                alternative="greater")
            name = terms_hash[key]
            data.append([name, key, np.median(enrichment_analysis_input[key]['sublist']),
                         observed, expected, fold_enrichment_median,
                         fold_enrichment_sd, pvalue])

        enrichment_analysis = pd.DataFrame(data, columns=['name', 'id', 'n',
                                                          'observed', 'expected',
                                                          'median',
                                                          'std',
                                                          'pValue'])
        enrichment_analysis['qValue'] = \
            multitest.multipletests(enrichment_analysis['pValue'].values,
                                    method='fdr_bh')[1]

        filtered_enrichment = enrichment_analysis[(enrichment_analysis['n'] >= 2)]\
            .sort_values(
            by='median', ascending=False)

        return make_response(OK, data=filtered_enrichment.to_json(orient="records"))
    except Exception as e:
        logger.warning(f'({e}')
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
