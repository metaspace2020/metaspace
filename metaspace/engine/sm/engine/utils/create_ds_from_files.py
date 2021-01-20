import json
from datetime import datetime
from pathlib import Path

from sm.engine import molecular_db
from sm.engine.dataset import Dataset


def create_ds_from_files(ds_id, ds_name, ds_input_path, config_path=None, meta_path=None):
    config_path = config_path or Path(ds_input_path) / 'config.json'
    ds_config = json.load(open(config_path))
    if 'database_ids' not in ds_config:
        ds_config['database_ids'] = [
            molecular_db.find_by_name(db, True).id for db in ds_config['databases']
        ]

    meta_path = meta_path or Path(ds_input_path) / 'meta.json'
    if not Path(meta_path).exists():
        raise Exception('meta.json not found')
    metadata = json.load(open(str(meta_path)))

    return Dataset(
        id=ds_id,
        name=ds_name,
        input_path=str(ds_input_path),
        upload_dt=datetime.now(),
        metadata=metadata,
        is_public=True,
        config=ds_config,
    )
