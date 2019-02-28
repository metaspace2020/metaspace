import argparse
import logging
from itertools import groupby

from sm.engine.mol_db import MolDBServiceWrapper
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB
from sm.engine.colocalization import Colocalization


CORRUPT_COLOC_JOBS_SEL = """
WITH mol_db_lookup AS (SELECT unnest(%s::int[]) AS id, unnest(%s::text[]) AS name), 
    algorithm_lookup AS (SELECT unnest(%s::text[]) algorithm),
    fdr_lookup AS (SELECT unnest(%s::numeric[]) AS fdr), 
    job_fdr_counts AS (
      SELECT job_id, fdr.fdr, COUNT(*) AS num_annotations
      FROM iso_image_metrics iim
      JOIN fdr_lookup fdr ON iim.fdr <= fdr.fdr - 0.01
      GROUP BY job_id, fdr.fdr
      HAVING COUNT(*) > 2
    ), coloc_job_fdr_counts AS (
      SELECT cj.ds_id, cj.mol_db, cj.fdr, cj.algorithm, COUNT(*) AS num_annotations
      FROM graphql.coloc_job cj
      JOIN graphql.coloc_annotation ca ON cj.id = ca.coloc_job_id
      GROUP BY cj.id, cj.mol_db, cj.fdr, cj.algorithm
    )
SELECT DISTINCT j.ds_id, (CASE WHEN cj IS NULL THEN 'missing' ELSE 'corrupt' END) as reason
FROM dataset ds
JOIN job j ON ds.id = j.ds_id
JOIN job_fdr_counts jfc ON j.id = jfc.job_id
JOIN mol_db_lookup mdb ON j.db_id = mdb.id
CROSS JOIN algorithm_lookup alg
LEFT JOIN coloc_job_fdr_counts cj ON ds.id = cj.ds_id AND cj.mol_db = mdb.name 
                                  AND cj.fdr = jfc.fdr AND cj.algorithm = alg.algorithm
WHERE ds.status = 'FINISHED'
  AND j.status = 'FINISHED'
  AND (cj IS NULL OR cj.num_annotations < jfc.num_annotations)
ORDER BY j.ds_id DESC;
"""

MISSING_COLOC_JOBS_SEL = """
WITH mol_db_lookup AS (SELECT unnest(%s::int[]) AS id, unnest(%s::text[]) AS name), 
    algorithm_lookup AS (SELECT unnest(%s::text[]) algorithm),
    fdr_lookup AS (SELECT unnest(%s::numeric[]) AS fdr), 
    job_fdr_counts AS (
      SELECT job_id, fdr.fdr, COUNT(*) AS num_annotations
      FROM iso_image_metrics iim
      JOIN fdr_lookup fdr ON iim.fdr <= fdr.fdr - 0.01
      GROUP BY job_id, fdr.fdr
      HAVING COUNT(*) > 2
    ), coloc_job_fdr_counts AS (
      SELECT cj.ds_id, cj.mol_db, cj.fdr, cj.algorithm
      FROM graphql.coloc_job cj
      GROUP BY cj.id, cj.mol_db, cj.fdr, cj.algorithm
    )
SELECT DISTINCT j.ds_id
FROM dataset ds
JOIN job j ON ds.id = j.ds_id
JOIN job_fdr_counts jfc ON j.id = jfc.job_id
JOIN mol_db_lookup mdb ON j.db_id = mdb.id
CROSS JOIN algorithm_lookup alg
LEFT JOIN coloc_job_fdr_counts cj ON ds.id = cj.ds_id AND cj.mol_db = mdb.name 
                                  AND cj.fdr = jfc.fdr AND cj.algorithm = alg.algorithm
WHERE ds.status = 'FINISHED'
  AND j.status = 'FINISHED'
  AND cj IS NULL
ORDER BY j.ds_id DESC;
"""


def run_coloc_jobs(ds_id, sql_where, fix_missing, fix_corrupt):
    assert len([data_source for data_source in [ds_id, sql_where, fix_missing, fix_corrupt] if data_source]) == 1, \
           "Exactly one data source (ds_id, sql_where or repair) must be specified"
    assert not (ds_id and sql_where)

    conf = SMConfig.get_conf()

    db = DB(conf['db'])

    if ds_id:
        ds_ids = ds_id.split(',')
    elif sql_where:
        ds_ids = [id for (id, ) in db.select(f'SELECT DISTINCT dataset.id FROM dataset WHERE {sql_where}')]
    else:
        mol_db_service = MolDBServiceWrapper(conf['services']['mol_db'])
        mol_dbs = [(db['id'], db['name']) for db in mol_db_service.fetch_all_dbs()]
        mol_db_ids, mol_db_names = map(list, zip(*mol_dbs))
        algorithms = ['cosine', 'pca_cosine', 'pca_pearson', 'pca_spearman']
        fdrs = [0.05, 0.1, 0.2, 0.5]

        if fix_missing:
            logger.info('Checking for missing colocalization jobs...')
            results = db.select(MISSING_COLOC_JOBS_SEL, [list(mol_db_ids), list(mol_db_names), algorithms, fdrs])
            ds_ids = [ds_id for ds_id, in results]
            logger.info(f'Found {len(ds_ids)} missing colocalization sets')
        else:
            logger.info('Checking all colocalization jobs. This is super slow: ~5 minutes per 1000 datasets...')
            results = db.select(MISSING_COLOC_JOBS_SEL, [list(mol_db_ids), list(mol_db_names), algorithms, fdrs])
            ds_ids, reasons = map(list, zip(*results))
            reason_counts = ', '.join([f'{len(list(group))} {reason}' for reason, group in groupby(sorted(reasons))])
            logger.info(f'Found {reason_counts} colocalization sets')


    if not ds_ids:
        logger.warning('No datasets match filter')
        return

    for i, ds_id in enumerate(ds_ids):
        try:
            logger.info(f'Running colocalization on {i+1} out of {len(ds_ids)}')
            coloc = Colocalization(db)
            coloc.run_coloc_job_for_existing_ds(ds_id)
        except Exception:
            logger.error(f'Failed to run colocalization on {ds_id}', exc_info=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run colocalization jobs')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--ds-id', dest='ds_id', default=None, help='DS id (or comma-separated list of ids)')
    parser.add_argument('--sql-where', dest='sql_where', default=None,
                        help='SQL WHERE clause for picking rows from the dataset table, e.g. "status = \'FINISHED\'"')
    parser.add_argument('--fix-missing', action='store_true',
                        help='Run colocalization on all datasets that are missing colocalization data')
    parser.add_argument('--fix-corrupt', action='store_true',
                        help='Run colocalization on all datasets that are missing colocalization data, '
                             'or have incomplete colocalization data (SLOW)')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    run_coloc_jobs(args.ds_id, args.sql_where, args.fix_missing, args.fix_corrupt)
