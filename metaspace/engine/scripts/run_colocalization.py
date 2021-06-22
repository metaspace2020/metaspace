import argparse
import logging

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.postprocessing.colocalization import Colocalization
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.util import GlobalInit

CORRUPT_COLOC_JOBS_SEL = """
WITH mol_db_lookup AS (SELECT unnest(%s::int[]) AS id, unnest(%s::text[]) AS name), 
    fdr_lookup AS (SELECT unnest(%s::numeric[]) AS fdr), 
    algorithm_lookup AS (SELECT unnest(%s::text[]) algorithm),
    job_fdr_counts_temp AS (
        SELECT job_id, fdr, COUNT(*) num_annotations FROM annotation GROUP BY job_id, fdr
    ),
    job_fdr_counts AS (
      SELECT iim.job_id, fdr.fdr, SUM(num_annotations) AS num_annotations
      FROM job_fdr_counts_temp iim
      JOIN fdr_lookup fdr ON iim.fdr <= fdr.fdr + 0.01
      GROUP BY job_id, fdr.fdr
      HAVING SUM(num_annotations) > 2
    ), coloc_job_fdr_counts AS (
      SELECT cj.ds_id, cj.mol_db, cj.fdr, cj.algorithm, COUNT(*) AS num_annotations
      FROM graphql.coloc_job cj
      JOIN graphql.coloc_annotation ca ON cj.id = ca.coloc_job_id
      GROUP BY cj.ds_id, cj.mol_db, cj.fdr, cj.algorithm
    )
SELECT DISTINCT j.ds_id
FROM dataset ds
JOIN job j ON ds.id = j.ds_id
JOIN job_fdr_counts jfc ON j.id = jfc.job_id
JOIN mol_db_lookup mdb ON j.moldb_id = mdb.id
CROSS JOIN algorithm_lookup alg
JOIN coloc_job_fdr_counts cj ON ds.id = cj.ds_id AND cj.mol_db = mdb.name
                                  AND cj.fdr = jfc.fdr AND cj.algorithm = alg.algorithm
WHERE ds.status = 'FINISHED'
  AND j.status = 'FINISHED'
  AND cj.num_annotations < jfc.num_annotations
ORDER BY j.ds_id DESC;
"""

MISSING_COLOC_JOBS_SEL = """
WITH mol_db_lookup AS (SELECT unnest(%s::int[]) AS id, unnest(%s::text[]) AS name), 
    fdr_lookup AS (SELECT unnest(%s::numeric[]) AS fdr), 
    job_fdr_counts_temp AS (
        SELECT job_id, fdr, COUNT(*) num_annotations FROM annotation GROUP BY job_id, fdr
    ),
    job_fdr_counts AS (
      SELECT iim.job_id, fdr.fdr, SUM(num_annotations) AS num_annotations
      FROM job_fdr_counts_temp iim
      JOIN fdr_lookup fdr ON iim.fdr <= fdr.fdr + 0.01
      GROUP BY job_id, fdr.fdr
      HAVING SUM(num_annotations) > 2
    ), coloc_job_fdr_counts AS (
      SELECT cj.ds_id, cj.mol_db, cj.fdr, array_agg(cj.algorithm) AS algorithms
      FROM graphql.coloc_job cj
      GROUP BY cj.ds_id, cj.mol_db, cj.fdr
    )
SELECT DISTINCT j.ds_id
FROM dataset ds
JOIN job j ON ds.id = j.ds_id
JOIN job_fdr_counts jfc ON j.id = jfc.job_id
JOIN mol_db_lookup mdb ON j.moldb_id = mdb.id
LEFT JOIN coloc_job_fdr_counts cj ON ds.id = cj.ds_id AND cj.mol_db = mdb.name AND cj.fdr = jfc.fdr
WHERE ds.status = 'FINISHED'
  AND j.status = 'FINISHED'
  AND (cj IS NULL OR NOT cj.algorithms @> %s::text[])
ORDER BY j.ds_id DESC;
"""


def run_coloc_jobs(
    sm_config, ds_id_str, sql_where, fix_missing, fix_corrupt, skip_existing, use_lithops
):
    assert (
        len(
            [
                data_source
                for data_source in [ds_id_str, sql_where, fix_missing, fix_corrupt]
                if data_source
            ]
        )
        == 1
    ), "Exactly one data source (ds_id, sql_where, fix_missing, fix_corrupt) must be specified"
    assert not (ds_id_str and sql_where)

    db = DB()

    if ds_id_str:
        ds_ids = ds_id_str.split(',')
    elif sql_where:
        ds_ids = [
            id for (id,) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')
        ]
    else:
        mol_dbs = [
            (doc['id'], doc['name'])
            for doc in db.select_with_fields('SELECT id, name FROM molecular_db m')
        ]
        mol_db_ids, mol_db_names = map(list, zip(*mol_dbs))
        fdrs = [0.05, 0.1, 0.2, 0.5]
        algorithms = ['median_thresholded_cosine', 'cosine']

        if fix_missing:
            logger.info('Checking for missing colocalization jobs...')
            results = db.select(
                MISSING_COLOC_JOBS_SEL, [list(mol_db_ids), list(mol_db_names), fdrs, algorithms]
            )
            ds_ids = [ds_id for ds_id, in results]
            logger.info(f'Found {len(ds_ids)} missing colocalization sets')
        else:
            logger.info(
                'Checking all colocalization jobs. '
                'This is super slow: ~5 minutes per 1000 datasets...'
            )
            results = db.select(
                CORRUPT_COLOC_JOBS_SEL, [list(mol_db_ids), list(mol_db_names), fdrs, algorithms]
            )
            ds_ids = [ds_id for ds_id, in results]
            logger.info(f'Found {len(ds_ids)} corrupt colocalization sets')

    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    if use_lithops:
        executor = Executor(sm_config['lithops'])

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'Running colocalization on {i+1} out of {len(ds_ids)}')
            ds = Dataset.load(db, ds_id)
            coloc = Colocalization(db)
            if use_lithops:
                # noinspection PyUnboundLocalVariable
                coloc.run_coloc_job_lithops(executor, ds, reprocess=not skip_existing)
            else:
                coloc.run_coloc_job(ds, reprocess=not skip_existing)
        except Exception:
            logger.error(f'Failed to run colocalization on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run colocalization jobs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)'
    )
    parser.add_argument(
        '--sql-where',
        dest='sql_where',
        default=None,
        help='SQL WHERE clause for picking rows from the dataset table, '
        'e.g. "status = \'FINISHED\'"',
    )
    parser.add_argument(
        '--fix-missing',
        action='store_true',
        help='Run colocalization on all datasets that are missing colocalization data',
    )
    parser.add_argument(
        '--fix-corrupt',
        action='store_true',
        help='Run colocalization on all datasets that have incomplete colocalization data (SLOW)',
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Re-run colocalization jobs even if they have already successfully run',
    )
    parser.add_argument(
        '--lithops',
        action='store_true',
        help='Use Lithops implementation',
    )
    args = parser.parse_args()
    logger = logging.getLogger('engine')

    with GlobalInit(config_path=args.config) as sm_config:
        run_coloc_jobs(
            sm_config=sm_config,
            ds_id_str=args.ds_id,
            sql_where=args.sql_where,
            fix_missing=args.fix_missing,
            fix_corrupt=args.fix_corrupt,
            skip_existing=args.skip_existing,
            use_lithops=args.lithops,
        )
