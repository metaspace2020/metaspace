import logging
import random
import time
from typing import Dict, List

import numpy as np
import pandas as pd

from sm.engine.enrichment_db_molecule_mapping import get_mappings_by_formula
from sm.engine.errors import SMError

logger = logging.getLogger('annotation-pipeline')


def select_all_records(moldb_id: int, molecules: pd.DataFrame) -> List[Dict]:
    """
    Select all records from the table `enrichment_db_molecule_mapping`
    for formulas present in molecules dataframe
    """
    metabolites = []
    for _, row in molecules.iterrows():
        try:
            terms = get_mappings_by_formula(row['formula'], moldb_id)
            for term in terms:
                modifier = row['modifier'] if row['modifier'] is not np.nan else ''
                metabolites.append(
                    {
                        'ion': f'{row["formula"]}{modifier}',
                        'mol_name': term.molecule_enriched_name,
                        'term_id': term.id,
                    }
                )
        except SMError:
            pass

    return metabolites


def calc_mol_hash(metabolites: List[Dict]) -> Dict:
    # group `metabolites` records by ion
    mol_hash = {}
    for row in metabolites:
        item = mol_hash.get(row['ion'], [])
        item.append({'mol_name': row['mol_name'], 'mol_id': row['term_id']})
        mol_hash[row['ion']] = item
    return mol_hash


def calc_bootstrapping(
    molecules: pd.DataFrame, mol_hash: Dict, bootstrapping_number: int = 100
) -> List[List]:
    bootstrapping_sublist = []
    for n in range(bootstrapping_number):
        bootstrapping_dict = {}
        for _, row in molecules.iterrows():
            ion = f'{row["formula"]}{row["modifier"]}'
            if ion in mol_hash:
                bootstrapping_dict[ion] = random.choice(mol_hash[ion])
                bootstrapping_sublist.append(
                    [n, ion, row['fdr'], bootstrapping_dict[ion]['mol_id']]
                )
    return bootstrapping_sublist


def run_enrichment(results_dfs: Dict[int, pd.DataFrame]) -> Dict[int, pd.DataFrame]:
    bootstrap_hash = {}
    for moldb_id, molecules in results_dfs.items():
        start_time = time.time()

        metabolites = select_all_records(moldb_id, molecules)
        mol_hash = calc_mol_hash(metabolites)
        bootstrapping_sublist = calc_bootstrapping(molecules, mol_hash)

        columns = ['scenario', 'formula_adduct', 'fdr', 'enrichment_db_molecule_mapping_id']
        bootstrap_hash[moldb_id] = pd.DataFrame(bootstrapping_sublist, columns=columns)

        logger.info(
            (
                f'Database ID: {moldb_id}, molecules = {len(molecules)}'
                f'unique molecules = {len(mol_hash)}, metabolites = {len(metabolites)}'
                f'time = {round(time.time() - start_time, 1)} s'
            )
        )

    return bootstrap_hash
