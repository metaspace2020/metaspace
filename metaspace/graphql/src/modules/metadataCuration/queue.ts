import { EntityManager } from 'typeorm'
import { MetadataV2Envelope, OntologyTermValue } from '../dataset/projection'
import { MetadataCurationTerm, deletePendingRows } from './model'
import { isPlaceholderText, normalizeCurationText } from './normalize'
import { CURATION_SLOTS, CurationSlot, getSlotValue } from './slots'
import { suggestOntologyTermWithScore } from './ontologyLookup'

const TABLE = 'public.metadata_curation_term'
const MIN_APPROVED_SIMILARITY = 0.5

/** The free text of `value` when it is a pending, non-placeholder value that normalises to something. */
export function pendingFreeText(value: OntologyTermValue | null | undefined): string | null {
  const freeText = value?.value_free_text
  if (!value || value.curation_state !== 'pending_curation' || !freeText || isPlaceholderText(freeText)) {
    return null
  }
  // Text such as "(liver)" is no placeholder but normalises to '', which no row can stand for.
  return normalizeCurationText(freeText) === '' ? null : freeText
}

/** This dataset's row of `slot`, whatever its text and status. */
export async function findOwnRow(em: EntityManager, slot: string, datasetId: string):
  Promise<MetadataCurationTerm | undefined> {
  return await em.findOne(MetadataCurationTerm, { slot, datasetId })
}

/**
 * The most recently decided approved or mapped row of `slot`, of any dataset, whose normalised text or one of
 * whose aliases equals `normalizedText`. Rejections are never returned: they only hold for their own dataset.
 */
export async function findLatestDecision(em: EntityManager, slot: string, normalizedText: string):
  Promise<MetadataCurationTerm | undefined> {
  return await em.createQueryBuilder(MetadataCurationTerm, 'term')
    .where('term.slot = :slot', { slot })
    .andWhere('term.status IN (\'approved\', \'mapped\')')
    .andWhere('(term.normalizedText = :text OR term.aliases @> CAST(ARRAY[:text] AS text[]))', { text: normalizedText })
    .orderBy('term.decidedAt', 'DESC', 'NULLS LAST')
    .limit(1)
    .getOne()
}

/** Seed values of the curated-list (unbound) slots, owned here and copied into the webapp. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CURATED_VALUES: Record<string, string[]> = require('../../../metadataSchemas/curated_values.json')

/** The seed values of curated-list `slot` (empty for any other slot). */
export const curatedValuesFor = (slot: string): string[] => CURATED_VALUES[slot] ?? []

/**
 * The closest candidate of unbound `slot` by trigram similarity, if ≥ 0.5: its seed values and its approved
 * rows' canonical label, normalised text and aliases.
 */
export async function suggestCuratedValue(em: EntityManager, slot: string, text: string):
  Promise<{ label: string, score: number } | null> {
  // Seeds are scored by their normalised form (trailing parenthetical dropped), like the typed text.
  const seeds = curatedValuesFor(slot)
  const [best] = await em.query(`
    SELECT label, score FROM (
      SELECT seed.label, similarity(seed.norm, $2) AS score
      FROM unnest($4::text[], $5::text[]) AS seed(label, norm)
      UNION ALL
      SELECT coalesce(canonical_label, text) AS label,
        greatest(similarity(normalized_text, $2),
          coalesce(similarity(lower(canonical_label), $2), 0),
          coalesce((SELECT max(similarity(alias, $2)) FROM unnest(aliases) AS alias), 0)) AS score
      FROM ${TABLE}
      WHERE slot = $1 AND status = 'approved'
    ) candidates
    WHERE score >= $3
    ORDER BY score DESC, label ASC
    LIMIT 1`,
  [slot, normalizeCurationText(text), MIN_APPROVED_SIMILARITY, seeds, seeds.map(normalizeCurationText)])
  return best === undefined ? null : { label: best.label, score: best.score }
}

const suggestionFor = async(em: EntityManager, slot: CurationSlot, normalizedText: string) => {
  if (slot.bound) {
    const match = await suggestOntologyTermWithScore(em, slot.slot, normalizedText)
    return match && { ontologyId: match.curie as string | null, label: match.label, score: match.score }
  }
  const match = await suggestCuratedValue(em, slot.slot, normalizedText)
  return match && { ontologyId: null, label: match.label, score: match.score }
}

const INSERT_PENDING_SQL = `
  INSERT INTO ${TABLE} (slot, dataset_id, text, normalized_text, submitter_id,
    suggested_ontology_id, suggested_label, suggested_score)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

const pendingRowParams = async(em: EntityManager, slot: CurationSlot, datasetId: string, text: string,
  submitterId: string | null) => {
  const normalizedText = normalizeCurationText(text)
  const suggestion = await suggestionFor(em, slot, normalizedText)
  return [slot.slot, datasetId, text.trim(), normalizedText, submitterId,
    suggestion?.ontologyId ?? null, suggestion?.label ?? null, suggestion?.score ?? null]
}

/**
 * Makes this dataset's row of `slot` a fresh pending row for `text`: inserted, or, when the dataset already has a
 * row for the slot (decided or not), overwritten with the new text and its decision cleared. Returns the row.
 */
export async function upsertPendingRow(em: EntityManager, slot: CurationSlot, datasetId: string, text: string,
  submitterId: string | null): Promise<MetadataCurationTerm> {
  await em.query(`${INSERT_PENDING_SQL}
    ON CONFLICT (slot, dataset_id) DO UPDATE SET
      text = EXCLUDED.text,
      normalized_text = EXCLUDED.normalized_text,
      status = 'pending',
      canonical_label = NULL,
      ontology_id = NULL,
      aliases = '{}',
      note = NULL,
      decided_by_id = NULL,
      decided_at = NULL,
      apply_state = 'idle',
      applied_count = 0,
      suggested_ontology_id = EXCLUDED.suggested_ontology_id,
      suggested_label = EXCLUDED.suggested_label,
      suggested_score = EXCLUDED.suggested_score`,
  await pendingRowParams(em, slot, datasetId, text, submitterId))
  return await em.findOneOrFail(MetadataCurationTerm, { slot: slot.slot, datasetId })
}

/**
 * Deletes this dataset's pending rows of every curated slot whose value is not pending free text (resolved,
 * cleared, placeholder). Decided rows stay, so a later save of the same text still finds the decision.
 */
export async function prunePendingRows(em: EntityManager, datasetId: string, envelope: MetadataV2Envelope):
  Promise<void> {
  const settled = CURATION_SLOTS
    .filter(slot => pendingFreeText(getSlotValue(envelope.document, slot)) === null)
    .map(slot => slot.slot)
  if (settled.length > 0) {
    await deletePendingRows(em, datasetId, settled)
  }
}
