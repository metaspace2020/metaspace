import argparse
import logging
import os

import psycopg2

from sm.engine.config import init_loggers, SMConfig

logger = logging.getLogger('engine')


def dump_moldb_tables(db_config):
    logger.info('Dumping moldb tables to files')
    conn = psycopg2.connect(**db_config)
    curs = conn.cursor()

    with open('/tmp/molecular_db.csv', 'w') as stream:
        curs.copy_to(stream, 'molecular_db')

    with open('/tmp/molecule.csv', 'w') as stream:
        curs.copy_to(stream, 'molecule', columns=['db_id', 'mol_id', 'mol_name', 'sf', 'inchi'])

    conn.close()


def import_moldb_tables(db_config):
    logger.info('Importing moldb tables from files')
    conn = psycopg2.connect(**db_config)
    try:
        curs = conn.cursor()

        with open('/tmp/molecular_db.csv', 'r') as stream:
            curs.copy_from(stream, 'molecular_db', columns=['id', 'name', 'version'])

        curs.execute("select id from molecular_db")
        existing_moldb_ids = [row[0] for row in curs.fetchall()]
        curs.execute("select id from job where not (moldb_id = ANY(%s))", (existing_moldb_ids,))
        job_ids_to_delete = [row[0] for row in curs.fetchall()]
        logger.warning(f"Deleting jobs: {job_ids_to_delete}")
        curs.execute("delete from job where not (moldb_id = ANY(%s))", (existing_moldb_ids,))

        curs.execute("SELECT setval('molecular_db_id_seq', max(id)) FROM molecular_db;")
        curs.execute(
            (
                'ALTER TABLE "public"."job" ADD CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93" '
                'FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") '
                'ON DELETE NO ACTION ON UPDATE NO ACTION'
            )
        )

        with open('/tmp/molecule.csv', 'r') as stream:
            curs.copy_from(
                stream, 'molecule', columns=['moldb_id', 'mol_id', 'mol_name', 'formula', 'inchi']
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description='Migrate MolDB data from service to database')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    config = SMConfig.get_conf()
    init_loggers(config['logs'])

    moldb_db_config = {'host': 'localhost', 'database': 'mol_db', 'user': 'mol_db'}
    dump_moldb_tables(moldb_db_config)

    import_moldb_tables(config['db'])

    os.remove('/tmp/molecule.csv')
    os.remove('/tmp/molecular_db.csv')


if __name__ == '__main__':
    main()
