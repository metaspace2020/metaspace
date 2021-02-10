import argparse
import logging

from sm.engine.formula_parser import safe_generate_ion_formula
from sm.engine.ion_mapping import get_ion_id_mapping
from sm.engine.config import init_loggers, SMConfig
from sm.engine.db import DB, ConnectionPool

BATCH_SIZE = 10000
logger = logging.getLogger('engine')


def populate_ion_formula(db):
    logger.info("Adding ion_formula to existing ions")
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
            'WITH ion_formulas AS (SELECT UNNEST(%s::int[]) as id, '
            '                             UNNEST(%s::text[]) as new_ion_formula) '
            'UPDATE graphql.ion SET ion_formula = new_ion_formula '
            'FROM ion_formulas WHERE ion.id = ion_formulas.id',
            [ids, ion_formulas],
        )


def populate_ions(db):
    logger.info("Adding missing ions")
    ion_tuples = db.select(
        "SELECT DISTINCT formula, chem_mod, neutral_loss, adduct, "
        "(d.config->'isotope_generation'->>'charge')::int as charge "
        "FROM annotation "
        "JOIN job ON annotation.job_id = job.id "
        "JOIN dataset d on job.ds_id = d.id"
    )
    pos_ion_tuples = [(sf, cm, nl, ad) for sf, cm, nl, ad, ch in ion_tuples if ch == 1]
    if pos_ion_tuples:
        get_ion_id_mapping(db, pos_ion_tuples, 1)
    neg_ion_tuples = [(sf, cm, nl, ad) for sf, cm, nl, ad, ch in ion_tuples if ch == -1]
    if neg_ion_tuples:
        get_ion_id_mapping(db, neg_ion_tuples, -1)


def populate_ion_id(db):
    logger.info("Linking ions to annotation table")
    db.alter(
        "UPDATE annotation SET ion_id = ion.id "
        "FROM graphql.ion, job, dataset "
        "WHERE annotation.job_id = job.id "
        "AND job.ds_id = dataset.id "
        "AND annotation.formula = ion.formula "
        "AND annotation.chem_mod = ion.chem_mod "
        "AND annotation.neutral_loss = ion.neutral_loss "
        "AND annotation.adduct = ion.adduct "
        "AND (dataset.config->'isotope_generation'->>'charge')::int = ion.charge"
    )


def main():
    parser = argparse.ArgumentParser(description='Merge mol_dbs and adducts into config')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])

    conf = SMConfig.get_conf()
    with ConnectionPool(conf['db']):
        db = DB()
        populate_ion_formula(db)
        populate_ions(db)
        populate_ion_id(db)


if __name__ == '__main__':
    main()
