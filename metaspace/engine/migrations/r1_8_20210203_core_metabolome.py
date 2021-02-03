import argparse
import json
import logging
from typing import List, Dict

from sm.engine.db import DB
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')


def ttdoc(*content: Dict) -> str:
    return json.dumps({'type': 'doc', 'content': [{'type': 'paragraph', 'content': [*content]}]})


def tttext(text: str):
    return {'type': 'text', 'text': text}


def ttlink(text: str, href: str):
    return {'type': 'text', 'marks': [{'type': 'link', 'attrs': {'href': href}}], 'text': text}


def update_core_metabolome_database():
    db = DB()
    rows = db.select_with_fields("SELECT * FROM molecular_db WHERE name = 'core_metabolome_v3'")
    if rows:
        moldb = rows[0]

        logger.info(f'Updating molecular database: {moldb}')

        moldb['name'] = 'CoreMetabolome'
        moldb['version'] = 'v3'
        moldb['full_name'] = 'Core Metabolome Database'
        moldb['description'] = 'METASPACE database of core mammalian metabolites and lipids'
        moldb['link'] = 'https://metaspace2020.eu'
        moldb['citation'] = ttdoc(tttext('In preparation'))
        moldb['group_id'] = None
        moldb['is_public'] = True

        db.alter(
            (
                "UPDATE molecular_db "
                "SET name = %s, version = %s, full_name = %s, description = %s,"
                "    link = %s, citation = %s, group_id = %s, is_public = %s "
                "WHERE id = %s;"
            ),
            params=(
                moldb['name'],
                moldb['version'],
                moldb['full_name'],
                moldb['description'],
                moldb['link'],
                moldb['citation'],
                moldb['group_id'],
                moldb['is_public'],
                moldb['id'],
            ),
        )

    rows = db.select_with_fields("SELECT * FROM molecular_db WHERE name = 'CoreMetabolome'")
    if rows:
        logger.info(f'Updated database: {rows[0]}')
    else:
        logger.error(f'Did not find database "CoreMetabolome"')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Update Core Metabolome Database')
    parser.add_argument('--config', default='conf/config.json')
    args = parser.parse_args()

    with GlobalInit(args.config) as sm_config:
        update_core_metabolome_database()
