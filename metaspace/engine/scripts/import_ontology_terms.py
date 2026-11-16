import argparse
import logging

from sm.engine.ontology_term import clear_ontology_cache, get_slot_ontology_roots, import_subtree
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')


def main():
    help_msg = (
        'Import (or refresh) the ontology_term store for one or more metadata schema v2 slots. '
        'Not incremental - each run walks the full current subtree; terms no longer reachable are '
        'marked obsolete = true rather than deleted, so a CURIE a dataset already references never '
        'dangles. Sources are listed in graphql/metadataSchemas/ontology_slots.json (copied into '
        'sm/engine by `yarn gen-ontology-slots`). The organism slot '
        'imports the full NCBI taxonomy (2.5M terms, ~10 min, ~700 MB RAM, 1.1 GB in Postgres); '
        'set its obo_file to "ncbitaxon/subsets/taxslim.obo" for a few thousand common taxa.'
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

    slot_ontology_roots = get_slot_ontology_roots()
    slots = args.slots or list(slot_ontology_roots.keys())
    unknown = set(slots) - set(slot_ontology_roots.keys())
    if unknown:
        parser.error(
            f'Unknown slot(s): {sorted(unknown)}. Known: {sorted(slot_ontology_roots.keys())}'
        )

    # Several slots can share a root (maldi_matrix/solvent both bind CHEBI:24431): walk each root
    # once, and group by OBO file so each ontology is parsed once and released before the next.
    bindings = {}
    for slot in slots:
        for binding in slot_ontology_roots[slot]:
            key = (binding['obo_file'], binding['ontology'], binding['root'])
            bindings.setdefault(key, []).append(slot)

    with GlobalInit(args.config_path):
        for (obo_file, ontology, root), bound_slots in sorted(bindings.items()):
            logger.info(f'Importing {root} ({ontology}) for slot(s) {bound_slots}')
            n_terms = import_subtree(ontology, root, obo_file)
            logger.info(f'Imported {n_terms} terms under {root}')
            if all(key[0] != obo_file for key in bindings if key > (obo_file, ontology, root)):
                clear_ontology_cache()


if __name__ == '__main__':
    main()
