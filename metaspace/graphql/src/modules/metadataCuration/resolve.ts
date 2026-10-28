import { EntityManager } from 'typeorm'
import logger from '../../utils/logger'
import { MetadataV2Envelope, OntologyTermValue } from '../dataset/projection'
import { MetadataCurationTerm } from './model'
import { normalizeCurationText } from './normalize'
import { findExactOntologyTerm } from './ontologyLookup'
import { findLatestDecision, findOwnRow, pendingFreeText, upsertPendingRow } from './queue'
import { CURATION_SLOTS, CurationSlot, getSlotValue, setSlotValue } from './slots'

export interface CurationResolution {
  envelope: MetadataV2Envelope
  errors: { dataPath: string, message: string }[]
}

/** The value a curator's decision on `term` turns `value` into; the typed free text is always kept. */
export function resolvedValue(value: OntologyTermValue, term: MetadataCurationTerm): OntologyTermValue {
  const { value_free_text } = value
  switch (term.status) {
    case 'approved':
      return { value_label: term.canonicalLabel, value_free_text, curation_state: 'free_text_accepted' }
    case 'mapped':
      return {
        value_ontology_id: term.ontologyId,
        value_label: term.canonicalLabel,
        value_free_text,
        curation_state: 'controlled',
      }
    case 'rejected':
      return { value_free_text, curation_state: 'pending_curation' }
    default:
      return value
  }
}

const rejectionMessage = (text: string, note: string | null) =>
  note ? `"${text}" was rejected by a curator: ${note}` : `"${text}" was rejected by a curator`

/**
 * Resolves the typed free text of every curated slot still `pending_curation`, in order: an exact ontology match
 * (bound slots); this dataset's own row for the same text (rejected reports an error, approved/mapped resolve,
 * pending stays); the latest approved/mapped decision on any dataset; otherwise this dataset's pending row is
 * written (replacing its row for the slot, decided or not). Mutates and returns `envelope`; lookup failures are
 * logged and leave the value pending.
 */
export async function resolveCurationStates(envelope: MetadataV2Envelope, em: EntityManager, datasetId: string,
  submitterId: string | null): Promise<CurationResolution> {
  const resolution: CurationResolution = { envelope, errors: [] }
  for (const slot of CURATION_SLOTS) {
    const value = getSlotValue(envelope.document, slot)
    const freeText = pendingFreeText(value)
    if (!value || freeText === null) {
      continue
    }
    try {
      await resolveSlotValue(em, slot, value, freeText, datasetId, submitterId, resolution)
    } catch (err) {
      logger.error(`Metadata curation lookup failed for slot ${slot.slot}`, err)
    }
  }
  return resolution
}

const resolveSlotValue = async(em: EntityManager, slot: CurationSlot, value: OntologyTermValue, freeText: string,
  datasetId: string, submitterId: string | null, resolution: CurationResolution) => {
  const normalizedText = normalizeCurationText(freeText)
  if (slot.bound) {
    const match = await findExactOntologyTerm(em, slot.slot, normalizedText)
    if (match !== null && match !== 'ambiguous') {
      setSlotValue(resolution.envelope.document, slot, {
        value_ontology_id: match.curie,
        value_label: match.label,
        value_free_text: freeText,
        curation_state: 'controlled',
      })
      return
    }
  }
  const own = await findOwnRow(em, slot.slot, datasetId)
  if (own !== undefined && own.normalizedText === normalizedText) {
    if (own.status === 'rejected') {
      resolution.errors.push({
        dataPath: `.metadataV2.document.${slot.path.join('.')}`,
        message: rejectionMessage(freeText, own.note),
      })
    } else if (own.status !== 'pending') {
      setSlotValue(resolution.envelope.document, slot, resolvedValue(value, own))
    }
    return
  }
  const decision = await findLatestDecision(em, slot.slot, normalizedText)
  if (decision !== undefined) {
    setSlotValue(resolution.envelope.document, slot, resolvedValue(value, decision))
    return
  }
  await upsertPendingRow(em, slot, datasetId, freeText, submitterId)
}
