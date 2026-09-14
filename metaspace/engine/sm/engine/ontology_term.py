"""Ontology term store for metadata schema v2 (see metaspace_metadata's
docs/integration_metaspace.md SS6). Rows are populated by scripts/import_ontology_terms.py, which
uses the functions in this module - never hand-written.
"""

import logging
from typing import Dict, Iterable, List

from sm.engine.db import DB, transaction_context

logger = logging.getLogger('engine')

# Slot -> reachable_from root(s), mirroring schema/metaspace_submission.yaml's `reachable_from`
# declarations in the metaspace_metadata repo (each entry names the OBO file oaklib fetches the
# ontology from, e.g. "mondo.obo" -> http://purl.obolibrary.org/obo/mondo.obo).
#
# TODO(metadata schema v2): once that schema is vendored (blocked as of writing on the schema
# repo's own 0.2.0 release), read this table from the vendored generated JSON Schema instead of
# hand-maintaining it here, per integration spec SS6 - "the ontology import table is read from the
# schema, not transcribed into METASPACE" is the whole point of that design. This hardcoded copy is
# a stopgap so the import script has something correct to walk in the meantime, not the intended
# long-term source of truth. Must stay byte-for-byte in sync with graphql's
# src/modules/lookups/controller.ts::SLOT_SUBTREES until vendoring lands - drift between the two
# would make the resolver's scoping disagree with what's actually imported.
SLOT_ONTOLOGY_ROOTS: Dict[str, List[Dict[str, str]]] = {
    'organism': [
        {'ontology': 'ncbitaxon', 'root': 'NCBITaxon:131567', 'obo_file': 'ncbitaxon.obo'}
    ],
    'anatomical_site_coarse': [
        {'ontology': 'uberon', 'root': 'UBERON:0001062', 'obo_file': 'uberon.obo'}
    ],
    'disease': [{'ontology': 'mondo', 'root': 'MONDO:0000001', 'obo_file': 'mondo.obo'}],
    'developmental_stage': [{'ontology': 'efo', 'root': 'EFO:0000399', 'obo_file': 'efo.obo'}],
    'cell_line_id': [{'ontology': 'efo', 'root': 'EFO:0000322', 'obo_file': 'efo.obo'}],
    'ionization_source': [{'ontology': 'ms', 'root': 'MS:1000008', 'obo_file': 'ms.obo'}],
    # instrument_model spans two PSI-MS subtrees (vendor models vs. bare analyzer types) - see
    # design_decisions.md's "Flagged coverage problems" and integration spec SS6.
    'instrument_model': [
        {'ontology': 'ms', 'root': 'MS:1000031', 'obo_file': 'ms.obo'},
        {'ontology': 'ms', 'root': 'MS:1000443', 'obo_file': 'ms.obo'},
    ],
    'maldi_matrix': [{'ontology': 'chebi', 'root': 'CHEBI:24431', 'obo_file': 'chebi.obo'}],
    'solvent': [{'ontology': 'chebi', 'root': 'CHEBI:24431', 'obo_file': 'chebi.obo'}],
}


def _get_adapter(obo_file: str):
    # Imported lazily so `oaklib` (a fairly heavy dependency - pulls in pronto, SQLAlchemy,
    # networkx, sssom, ...) is only required by callers that actually run an import, not by
    # anything that merely imports this module to read SLOT_ONTOLOGY_ROOTS.
    # pylint: disable=import-outside-toplevel
    from oaklib.implementations.pronto.pronto_implementation import ProntoImplementation
    from oaklib.resource import OntologyResource

    resource = OntologyResource(local=False, slug=obo_file)
    return ProntoImplementation(resource)


def walk_subtree(root: str, obo_file: str) -> Iterable[Dict]:
    """Yield {curie, label, synonyms} for every term reachable from `root` via rdfs:subClassOf
    (`include_self: false`, matching the LinkML schema's `reachable_from` declaration)."""
    # pylint: disable=import-outside-toplevel
    from oaklib.datamodels.vocabulary import IS_A

    adapter = _get_adapter(obo_file)
    for curie in adapter.descendants([root], predicates=[IS_A]):
        if curie == root:
            continue  # reachable_from's include_self: false
        label = adapter.get_label_by_curie(curie)
        if not label:
            continue
        synonyms = adapter.aliases_by_curie(curie) or []
        yield {'curie': curie, 'label': label, 'synonyms': synonyms}


def import_subtree(ontology: str, root: str, obo_file: str) -> int:
    """Import (or refresh) one subtree. Not incremental (integration spec SS6): walks the full
    current subtree, upserts every reachable term, and marks any previously-stored term under this
    `subtree` that's no longer reachable as `obsolete = true` rather than deleting it - so a CURIE
    a dataset already references never dangles."""
    terms = list(walk_subtree(root, obo_file))
    logger.info(f'Walked {len(terms)} terms under {root} ({ontology})')

    if not terms:
        # Most likely a transient fetch failure, not a genuinely empty subtree - every root in
        # SLOT_ONTOLOGY_ROOTS has at least some descendants. Marking everything obsolete on an
        # empty walk would be actively harmful (every stored CURIE in this subtree would flip to
        # obsolete because of a network blip), so refuse rather than guess.
        logger.warning(
            f'Walk of {root} ({ontology}) returned zero terms - not touching existing rows, this '
            f'looks like a fetch failure rather than a real empty subtree'
        )
        return 0

    with transaction_context():
        rows = [(t['curie'], t['label'], t['synonyms'], ontology, root, False) for t in terms]
        DB().alter_many(
            'INSERT INTO ontology_term (curie, label, synonyms, ontology, subtree, obsolete) '
            'VALUES %s '
            'ON CONFLICT (curie, subtree) DO UPDATE SET '
            '  label = EXCLUDED.label, synonyms = EXCLUDED.synonyms, '
            '  ontology = EXCLUDED.ontology, obsolete = false',
            rows=rows,
        )
        DB().alter(
            'UPDATE ontology_term SET obsolete = true WHERE subtree = %s AND NOT (curie = ANY(%s))',
            params=(root, [t['curie'] for t in terms]),
        )
    return len(terms)
