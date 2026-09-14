import argparse
import logging

from sm.engine.ontology_term import SLOT_ONTOLOGY_ROOTS, import_subtree
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')


def main():
    help_msg = (
        'Import (or refresh) the ontology_term store for one or more metadata schema v2 slots. '
        'Not incremental - each run walks the full current subtree; terms no longer reachable are '
        'marked obsolete = true rather than deleted, so a CURIE a dataset already references never '
        'dangles.'
    )
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument(
        '--slot',
        action='append',
        dest='slots',
        help='A slot name to import (e.g. "disease"). May be repeated. Default: all known slots.',
    )
    parser.add_argument(
        '--config', dest='config_path', default='conf/config.json', help='SM config path'
    )
    args = parser.parse_args()

    slots = args.slots or list(SLOT_ONTOLOGY_ROOTS.keys())
    unknown = set(slots) - set(SLOT_ONTOLOGY_ROOTS.keys())
    if unknown:
        parser.error(
            f'Unknown slot(s): {sorted(unknown)}. Known: {sorted(SLOT_ONTOLOGY_ROOTS.keys())}'
        )

    with GlobalInit(args.config_path):
        for slot in slots:
            for binding in SLOT_ONTOLOGY_ROOTS[slot]:
                logger.info(f'Importing slot "{slot}": {binding["root"]} ({binding["ontology"]})')
                n_terms = import_subtree(binding['ontology'], binding['root'], binding['obo_file'])
                logger.info(f'Imported {n_terms} terms for slot "{slot}" / {binding["root"]}')


if __name__ == '__main__':
    main()
