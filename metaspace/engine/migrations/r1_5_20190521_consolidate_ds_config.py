import argparse
import json
import logging
import os

from sm.engine.dataset import generate_ds_config, update_ds_config
from sm.engine.config import init_loggers, SMConfig
from sm.engine.db import DB


def migrate(db, output_file):
    datasets = db.select("SELECT id, metadata, config, mol_dbs, adducts FROM dataset ORDER BY id")

    # Backup
    to_backup = [
        [id, config, mol_dbs, adducts] for id, metadata, config, mol_dbs, adducts in datasets
    ]
    json.dump(to_backup, output_file, indent=2, sort_keys=True)

    # Update configs
    new_configs = [
        (id, json.dumps(update_ds_config(config, metadata, mol_dbs=mol_dbs, adducts=adducts)))
        for id, metadata, config, mol_dbs, adducts in datasets
    ]
    db.alter_many(
        "UPDATE dataset "
        "SET config = u.config::json "
        "FROM (VALUES %s) u(id, config) "
        "WHERE dataset.id = u.id",
        new_configs,
    )

    # Drop old columns
    db.alter("ALTER TABLE dataset DROP COLUMN mol_dbs, DROP COLUMN adducts")


def revert(db):
    db.alter("ALTER TABLE dataset ADD COLUMN mol_dbs text[], ADD COLUMN adducts text[]")

    db.alter(
        "UPDATE dataset SET mol_dbs = ARRAY(SELECT json_array_elements_text(config #> '{databases}')), "
        "adducts = ARRAY(SELECT json_array_elements_text(config #> '{isotope_generation,adducts}'))"
    )

    db.alter(
        "ALTER TABLE dataset ALTER COLUMN mol_dbs SET NOT NULL, ALTER COLUMN adducts SET NOT NULL"
    )


def restore(db, backup_file):
    # Revert schema change
    db.alter("ALTER TABLE dataset ADD COLUMN mol_dbs text[], ADD COLUMN adducts text[]")

    backup = [
        (id, json.dumps(config), mol_dbs, adducts)
        for id, config, mol_dbs, adducts in json.load(backup_file)
    ]

    db.alter_many(
        "UPDATE dataset "
        "SET config = u.config::json, mol_dbs = u.mol_dbs, adducts = u.adducts "
        "FROM (VALUES %s) u(id, config, mol_dbs, adducts) "
        "WHERE dataset.id = u.id",
        backup,
    )

    # Fix any datasets that don't have backup data
    db.alter(
        "UPDATE dataset SET mol_dbs = ARRAY(SELECT json_array_elements_text(config #> '{databases}')), "
        "adducts = ARRAY(SELECT json_array_elements_text(config #> '{isotope_generation,adducts}'))"
        "WHERE mol_dbs IS NULL AND adducts IS NULL"
    )

    db.alter(
        "ALTER TABLE dataset ALTER COLUMN mol_dbs SET NOT NULL, ALTER COLUMN adducts SET NOT NULL"
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Merge mol_dbs and adducts into config')
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument('--backup-file', help="Specify filename for backup")
    parser.add_argument(
        '--revert',
        action='store_true',
        help="Revert by extracting data from config (potentially lossy)",
    )
    parser.add_argument(
        '--restore-backup', action='store_true', help="Restore from file (lossless)"
    )
    args = parser.parse_args()

    SMConfig.set_path(args.config)
    init_loggers(SMConfig.get_conf()['logs'])
    logger = logging.getLogger('engine')

    conf = SMConfig.get_conf()
    db = DB(conf['db'])

    backup_file = args.backup_file or 'r1_5_20190521_consolidate_ds_config_backup.json'

    if args.restore_backup:
        restore(db, open(backup_file, 'r'))
    elif args.revert:
        revert(db)
    else:
        if os.path.exists(backup_file):
            raise ValueError('backup file already exists')

        migrate(db, open(backup_file, 'w'))
