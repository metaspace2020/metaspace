import logging
import random
import time
from typing import Dict

import numpy as np
import pandas as pd

from sm.engine import enrichment_db_molecule_mapping
from sm.engine.errors import SMError

logger = logging.getLogger('annotation-pipeline')


def run_enrichment(results_dfs: Dict[int, pd.DataFrame]) -> Dict[int, pd.DataFrame]:
    start = time.time()
    bootstrap_hash = {}
    for moldb_id in results_dfs:
        molecules = results_dfs[moldb_id]
        data = []
        for _, row in molecules.iterrows():
            try:
                terms = enrichment_db_molecule_mapping.get_mappings_by_formula(
                    row['formula'], str(moldb_id)
                )
                for term in terms:
                    ion = str(row['formula']) + (
                        str(row['modifier']) if row['modifier'] is not np.nan else ''
                    )
                    data.append([ion, term.molecule_enriched_name, term.id])
            except SMError:
                pass
        dataset_metabolites = pd.DataFrame(
            data, columns=['formula_adduct', 'molecule_name', 'term_id']
        )

        # bootstrapping
        hash_mol = {}
        for _, row in dataset_metabolites.iterrows():
            if row['formula_adduct'] not in hash_mol.keys():
                hash_mol[row['formula_adduct']] = []
            hash_mol[row['formula_adduct']].append(
                {'mol_name': row['molecule_name'], 'mol_id': row['term_id']}
            )

        boot_n = 100  # times bootstrapping
        bootstrap_sublist = []
        for n in range(boot_n):
            bootstrap_dict_aux = {}
            for _, row in molecules.iterrows():
                ion = str(row['formula']) + str(row['modifier'])
                if ion in hash_mol.keys():
                    bootstrap_dict_aux[ion] = random.choice(hash_mol[ion])
                    bootstrap_sublist.append(
                        [n, ion, row['fdr'], bootstrap_dict_aux[ion]['mol_id']]
                    )

        bootstrap_hash[moldb_id] = pd.DataFrame(
            bootstrap_sublist,
            columns=['scenario', 'formula_adduct', 'fdr', 'enrichment_db_molecule_mapping_id'],
        )

        logger.info(f'Bootstraping generated for {moldb_id=} - {round(time.time()-start, 3)}s')

    return bootstrap_hash
