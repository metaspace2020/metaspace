import { EntityManager } from 'typeorm'
import { SLOT_SUBTREES, suggestOntologyTerms } from '../lookups/controller'
import { normalizeCurationText } from './normalize'

type OntologyMatch = { curie: string, label: string }

// Runs at save time on every submission, so each stage is one indexed statement: label equality uses the
// (subtree, lower(label)) btree; synonym equality is prefiltered by the trigram GIN index on
// ontology_term_synonym_text(synonyms) (an escaped substring ILIKE), so it never unnests a whole subtree.
// A text under 3 characters skips the synonym stage. LIMIT 2 is enough to tell a unique hit from an ambiguous one.
const EXACT_LABEL_SQL = `
  SELECT curie, label FROM public.ontology_term
  WHERE subtree = ANY($1) AND obsolete = false AND lower(label) = $2
  LIMIT 2`
const EXACT_SYNONYM_SQL = `
  SELECT curie, label FROM public.ontology_term
  WHERE subtree = ANY($1) AND obsolete = false AND ontology_term_synonym_text(synonyms) ILIKE $3
    AND EXISTS (SELECT 1 FROM unnest(synonyms) AS synonym WHERE lower(synonym) = $2)
  LIMIT 2`

/**
 * The single non-obsolete term of the slot's subtrees whose label (or, failing that and for a text of 3+
 * characters, a synonym) equals `normalizedText` case-insensitively; 'ambiguous' when a stage finds two; null when nothing matches or the
 * slot is not bound to an ontology.
 */
export async function findExactOntologyTerm(em: EntityManager, slot: string, normalizedText: string):
  Promise<OntologyMatch | 'ambiguous' | null> {
  const subtrees = SLOT_SUBTREES[slot]
  if (!subtrees || subtrees.length === 0) {
    return null
  }
  // Escape ILIKE metacharacters so a literal '%' or '_' in the text can't widen the prefilter.
  const substringPattern = `%${normalizedText.replace(/[\\%_]/g, '\\$&')}%`
  const stages: [string, any[]][] = [[EXACT_LABEL_SQL, [subtrees, normalizedText]]]
  // The trigram index cannot serve a pattern under 3 characters, so such a text would scan the subtree
  if (normalizedText.length >= 3) {
    stages.push([EXACT_SYNONYM_SQL, [subtrees, normalizedText, substringPattern]])
  }
  for (const [sql, params] of stages) {
    const rows: OntologyMatch[] = await em.query(sql, params)
    if (rows.length > 1) {
      return 'ambiguous'
    }
    if (rows.length === 1) {
      return { curie: rows[0].curie, label: rows[0].label }
    }
  }
  return null
}

/** The autocomplete's best candidate for `text` with its trigram similarity (0-1) to the normalised text. */
export async function suggestOntologyTermWithScore(em: EntityManager, slot: string, text: string):
  Promise<(OntologyMatch & { score: number }) | null> {
  const [best] = await suggestOntologyTerms(em, slot, text, 1)
  if (best === undefined) {
    return null
  }
  const [{ score }] = await em.query('SELECT similarity(lower($1), $2) AS score',
    [best.label, normalizeCurationText(text)])
  return { curie: best.curie, label: best.label, score }
}
