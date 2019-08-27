import argparse
import logging

from sm.engine.formula_parser import safe_generate_ion_formula
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB

logger = logging.getLogger('engine')


def populate_ion_formula(conf):
    db = DB(conf['db'])
    BATCH_SIZE = 10000
    ion_tuples = db.select(
        "SELECT id, formula, chem_mod, neutral_loss, adduct FROM graphql.ion WHERE ion_formula = ''"
    )

    for i in range(0, len(ion_tuples), BATCH_SIZE):
        print(f'Processing {i} out of {len(ion_tuples)}')
        ids = [id for id, *parts in ion_tuples[i : i + BATCH_SIZE]]
        ion_formulas = [
            safe_generate_ion_formula(*parts) for id, *parts in ion_tuples[i : i + BATCH_SIZE]
        ]

        db.alter(
            'WITH ion_formulas AS (SELECT UNNEST(%s::int[]) as id, UNNEST(%s::text[]) as new_ion_formula) '
            'UPDATE graphql.ion SET ion_formula = new_ion_formula '
            'FROM ion_formulas WHERE ion.id = ion_formulas.id',
            [ids, ion_formulas],
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Merge mol_dbs and adducts into config')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])

    conf = SMConfig.get_conf()
    populate_ion_formula(conf)
