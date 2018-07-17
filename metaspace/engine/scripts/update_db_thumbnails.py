#!/usr/bin/env python
import argparse
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.util import SMConfig
from sm.rest.dataset_manager import SMapiDatasetManager
import sm.rest.api as api
from sm.engine.png_generator import ImageStoreServiceWrapper

ALL_DS_MASK = '_all_'
UPD_DATASET_THUMB_OPTICAL_IMAGE = 'update dataset set thumbnail = %s WHERE id = %s'
SEL_OPTICAL_IMAGE_THUMBNAIL = 'SELECT thumbnail FROM dataset WHERE id = %s'

def set_metadata_thumbnail(db, config, ds_name):
    ds_thumb_query = 'SELECT id, transform, thumbnail from dataset {}'.format('WHERE name = %s' if ds_name != ALL_DS_MASK else '')
    for id, transform, thumbnail in db.select(ds_thumb_query, params=(ds_name,) if ds_name else None):
        if transform != None:
            ds = api.Dataset.load(db=db, ds_id=id)
            img_store = ImageStoreServiceWrapper(config['services']['img_service_url'])
            img_store.storage_type = 'fs'
            sm = SMapiDatasetManager(db=db, es=ESExporter(db), image_store=img_store, mode='queue')
            ds_opt_img_query = 'SELECT optical_image from dataset {}'.format('WHERE id = %s')
            img_id = db.select(ds_opt_img_query, params=(ds.id,))
            sm._add_thumbnail_optical_image(ds, f"{img_id[0][0]}", transform)

SMConfig.set_path('conf/config.json')
sm_config = SMConfig.get_conf()
set_metadata_thumbnail(DB(sm_config['db']), sm_config, 'Untreated_3_434')

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Updates thumbnail for a provided dataset")
    parser.add_argument('--ds-name', dest='ds_name', type=str, help="Process specific dataset given by its name")
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()

    db = DB(sm_config['db'])

    if args.ds_name:
        set_metadata_thumbnail(db, sm_config, args.ds_name)
    else:
        parser.print_help()