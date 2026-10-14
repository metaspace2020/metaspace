import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * Ontology term store (metadata schema v2 - see metaspace_metadata's
 * docs/integration_metaspace.md SS6). Rows are populated by engine/scripts/import_ontology_terms.py
 * via an oaklib walk of each bound slot's `reachable_from` root(s), never hand-written.
 *
 * `(curie, subtree)` is the composite primary key rather than `curie` alone so that one term can
 * appear under more than one binding without ambiguity - needed by `instrument_model`, which spans
 * both the PSI-MS instrument-model (MS:1000031) and mass-analyzer-type (MS:1000443) subtrees.
 */
@Entity({ schema: 'public', name: 'ontology_term' })
export class OntologyTerm {
  @PrimaryColumn({ type: 'text' })
  curie: string;

  @PrimaryColumn({ type: 'text' })
  @Index('ontology_term_subtree_index')
  subtree: string;

  // `label` and `synonyms` also carry trigram GIN indexes for ontologyTermSuggestions. TypeORM 0.2
  // cannot express gin_trgm_ops, so they live in the migration only and are absent from db_schema.sql.
  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'text', array: true, default: '{}' })
  synonyms: string[];

  @Column({ type: 'text' })
  ontology: string;

  @Column({ type: 'boolean', default: false })
  obsolete: boolean;
}

export const ONTOLOGY_ENTITIES = [OntologyTerm]
