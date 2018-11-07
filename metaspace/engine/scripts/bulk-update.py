import argparse
import logging
from copy import deepcopy

from sm.engine.mol_db import MolecularDB
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import init_loggers, SMConfig
from sm.engine.db import DB
from sm.engine.es_export import ESExporter, ESIndexManager

init_loggers(SMConfig.get_conf()['logs'])
logger = logging.getLogger('engine')
conf = SMConfig.get_conf()
db = DB(conf['db'])
es_exp = ESExporter(db)

ds_ids = [
    '2018-10-20_22h35m05s',
    '2018-09-16_21h10m17s',
    '2018-02-19_19h43m14s',
    '2018-10-06_00h14m13s',
    '2018-02-13_20h18m41s',
    '2018-02-19_19h41m03s',
    '2018-02-16_01h12m44s',
    '2018-10-17_22h21m06s',
    '2018-10-17_22h16m34s',
    '2018-05-15_22h57m40s',
    '2018-05-15_22h55m43s',
    '2018-09-01_00h55m05s',
    '2018-09-04_00h47m25s',
    '2018-09-04_00h44m59s',
    '2018-09-04_00h48m58s',
    '2018-09-04_00h52m04s',
    '2018-09-07_00h52m21s',
    '2018-10-18_20h20m57s',
    '2018-09-07_01h02m31s',
    '2018-10-31_01h48m17s',
    '2018-09-08_00h58m48s',
    '2018-10-31_20h28m53s',
    '2018-10-19_00h56m24s',
    '2018-10-19_01h06m20s',
    '2018-10-20_01h15m01s',
    '2018-09-04_00h50m59s',
    '2018-10-20_05h12m09s',
    '2018-10-20_05h20m31s',
    '2018-10-12_20h06m00s',
    '2018-10-16_01h42m26s',
    '2018-10-20_02h16m39s',
    '2018-11-05_14h40m23s',
    '2018-10-06_00h45m03s',
    '2018-10-05_00h52m32s',
    '2018-10-05_00h06m28s',
    '2018-10-04_23h25m43s',
    '2018-10-06_01h10m58s',
    '2018-05-15_22h52m29s',
    '2018-09-13_00h56m28s',
    '2018-09-16_21h17m40s',
    '2018-09-16_21h16m30s',
    '2017-05-30_06h56m05s',
    '2017-05-17_19h49m04s',
    '2017-05-16_04h18m52s',
    '2017-05-17_19h50m07s',
    '2017-05-18_18h30m26s',
    '2018-09-16_21h10m49s',
    '2018-09-08_01h05m09s',
    '2018-06-16_05h29m11s',
    '2018-09-07_00h49m45s',
    '2018-09-07_00h59m13s',
    '2018-09-01_00h50m21s',
    '2018-10-20_22h34m04s',
    '2018-02-13_20h17m20s',
    '2018-02-13_20h38m08s',
    '2018-10-31_20h46m16s',
    '2018-10-31_23h53m51s',
    '2018-10-19_19h55m16s',
    '2018-10-20_02h06m07s',
    '2018-10-16_16h42m00s',
    '2018-10-17_09h47m05s',

]

for idx, (ds_id) in enumerate(ds_ids):
    logger.info(f'Reindexing {idx+1} out of {len(ds_ids)}')
    ds_id, ds_name, ds_config = db.select_one("select id, name, config from dataset where id = %s", params=(ds_id,))
    try:
        es_exp.delete_ds(ds_id)
        for mol_db_name in ds_config['databases']:
            mol_db = MolecularDB(name=mol_db_name, iso_gen_config=ds_config['isotope_generation'])
            isocalc = IsocalcWrapper(ds_config['isotope_generation'])
            es_exp.index_ds(ds_id, mol_db=mol_db, isocalc=isocalc)
    except Exception as e:
        new_msg = 'Failed to reindex(ds_id={}, ds_name={}): {}'.format(ds_id, ds_name, e)
        logger.error(new_msg, exc_info=True)


