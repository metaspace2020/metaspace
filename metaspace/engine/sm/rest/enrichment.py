import logging
import time

import json
import numpy as np
import pandas as pd
from scipy.stats import fisher_exact
from statsmodels.stats import multitest

import bottle

from sm.rest.utils import make_response, OK, INTERNAL_ERROR

logger = logging.getLogger('api')
app = bottle.Bottle()


@app.post('/calculate_enrichment')
def calculate_enrichment():  # pylint: disable=too-many-locals
    try:
        body = json.loads(bottle.request.body.read().decode('utf-8'))
        logger.info('Received `calculate_enrichment` request')

        start = time.time()
        enrichment_sets = body['enrichedSets']
        bootstrapped_sublist = body['bootstrappedSublist']
        terms_hash = body['termsHash']
        enrichment_analysis_input = {}
        mols = []
        logger.info(f'Calculating from {len(enrichment_sets.keys())} terms.')
        for key in enrichment_sets.keys():
            db_items = set(enrichment_sets[key])
            enrichment_analysis_input[key] = {}
            enrichment_analysis_input[key]['background'] = len(enrichment_sets[key])
            enrichment_analysis_input[key]['sublist'] = []
            for index, bootstrap_item in enumerate(bootstrapped_sublist):
                intersection = db_items.intersection(set(bootstrap_item.values()))
                mols.append([key, index, list(intersection)])
                items_sum = len(intersection)
                enrichment_analysis_input[key]['sublist'].append(items_sum)

        data = []

        for key in enrichment_analysis_input.keys():
            if key == 'all':
                continue

            observed = np.median(enrichment_analysis_input[key]['sublist']) / np.median(
                enrichment_analysis_input['all']['sublist']
            )
            expected = (
                enrichment_analysis_input[key]['background']
                / enrichment_analysis_input['all']['background']
            )
            fold_enrichment_median = observed / expected  ## median fold enrichment
            fold_enrichment_sd = np.std(
                (
                    np.array(enrichment_analysis_input[key]['sublist'])
                    / np.array(enrichment_analysis_input['all']['sublist'])
                )
                / expected
            )
            _, pvalue = fisher_exact(
                [
                    [
                        np.median(enrichment_analysis_input[key]['sublist']),
                        np.median(enrichment_analysis_input['all']['sublist']),
                    ],
                    [
                        enrichment_analysis_input[key]['background'],
                        enrichment_analysis_input['all']['background'],
                    ],
                ],
                alternative="greater",
            )
            name = terms_hash[key]
            data.append(
                [
                    name,
                    key,
                    np.median(enrichment_analysis_input[key]['sublist']),
                    observed,
                    expected,
                    fold_enrichment_median,
                    fold_enrichment_sd,
                    pvalue,
                ]
            )

        enrichment_analysis = pd.DataFrame(
            data, columns=['name', 'id', 'n', 'observed', 'expected', 'median', 'std', 'pValue']
        )
        molecules = pd.DataFrame(mols, columns=['id', 'n', 'mols'])
        enrichment_analysis['qValue'] = multitest.multipletests(
            enrichment_analysis['pValue'].values, method='fdr_bh'
        )[1]
        filtered_enrichment = enrichment_analysis[(enrichment_analysis['n'] >= 2)].sort_values(
            by='median', ascending=False
        )

        logger.info(f'Enrichment calculated in {round(time.time() - start, 2)} sec')
        return make_response(
            OK,
            data=json.dumps(
                {
                    'enrichment': filtered_enrichment.to_dict(orient='records'),
                    'molecules': molecules.to_dict(orient='records'),
                }
            ),
        )
    except Exception as e:
        logger.warning(f'({e}')
        return make_response(INTERNAL_ERROR)
