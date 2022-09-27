import logging
import random
import time
from typing import Dict

import numpy as np
import pandas as pd

from sm.engine.enrichment_db_molecule_mapping import get_mappings_by_formula
from sm.engine.errors import SMError

logger = logging.getLogger('annotation-pipeline')


def run_enrichment(results_dfs: Dict[int, pd.DataFrame]) -> Dict[int, pd.DataFrame]:
    start = time.time()
    bootstrap_hash = {}
    for moldb_id, molecules in results_dfs.items():
        logger.info(f'Database is {moldb_id}:')
        molecules.to_csv(f'molecules_{moldb_id}.csv', index=False)

        start_time = time.time()
        dataset_metabolites = []
        # select all records from the table `enrichment_db_molecule_mapping`
        # for formulas present in result_dfs
        for _, row in molecules.iterrows():
            try:
                terms = get_mappings_by_formula(row['formula'], moldb_id)
                for term in terms:
                    modifier = row['modifier'] if not isinstance(row['modifier'], np.nan) else ''
                    dataset_metabolites.append(
                        {
                            'ion': f'{row["formula"]}{modifier}',
                            'mol_name': term.molecule_enriched_name,
                            'term_id': term.id,
                        }
                    )
            except SMError:
                pass
        logger.info(f' - first part {round(time.time()-start_time, 3)} s')

        # group `dataset_metabolites` records by ion
        start_time = time.time()
        hash_mol = {}
        for row in dataset_metabolites:
            item = hash_mol.get(row['ion'], [])
            item.append({'mol_name': row['mol_name'], 'mol_id': row['term_id']})
            hash_mol[row['ion']] = item
        logger.info(f' - second part {round(time.time()-start_time, 3)} s')

        # start bootstrapping
        start_time = time.time()
        boot_n = 100
        bootstrap_sublist = []
        random.seed(42)
        for n in range(boot_n):
            bootstrap_dict_aux = {}
            for _, row in molecules.iterrows():
                ion = f'{row["formula"]}{row["modifier"]}'
                if ion in hash_mol:
                    bootstrap_dict_aux[ion] = random.choice(hash_mol[ion])
                    bootstrap_sublist.append(
                        [n, ion, row['fdr'], bootstrap_dict_aux[ion]['mol_id']]
                    )
        logger.info(f' - third part {round(time.time() - start_time, 3)} s')

        bootstrap_hash[moldb_id] = pd.DataFrame(
            bootstrap_sublist,
            columns=['scenario', 'formula_adduct', 'fdr', 'enrichment_db_molecule_mapping_id'],
        )
        logger.info(f'  - number of molecules is {len(molecules)}')
        logger.info(f'  - number of hash_mol is {len(hash_mol)}')
        logger.info(f'  - size of dataset_metabolites is {len(dataset_metabolites)}')

    logger.info(f'All time is {round(time.time() - start, 3)} s')

    return bootstrap_hash
