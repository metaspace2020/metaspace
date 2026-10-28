import { EntityManager } from 'typeorm'
import { cloneDeep } from 'lodash'
import logger from '../../utils/logger'
import { smApiDatasetRequest } from '../../utils/smApi/datasets'
import { MetadataV2Envelope, projectLegacyField } from '../dataset/projection'
import { EngineDataset } from '../engine/model'
import { MetadataCurationTerm } from './model'
import { normalizeCurationText } from './normalize'
import { resolvedValue } from './resolve'
import { curationSlot, getSlotValue, setSlotValue } from './slots'

export interface CurationPatch {
  metadata: any
  metadataV2: MetadataV2Envelope
}

/**
 * The dataset documents after applying `term`'s decision to its slot: the v2 value is replaced by
 * `resolvedValue` and only that slot's legacy key is re-rendered; every other legacy field stays as stored.
 * Null when the slot value's free text does not normalise to the term's text or one of its aliases.
 */
export function patchDatasetForTerm(engineDataset: { metadata: any, metadataV2: MetadataV2Envelope },
  term: MetadataCurationTerm): CurationPatch | null {
  const slot = curationSlot(term.slot)
  const envelope = engineDataset.metadataV2
  if (!slot || !envelope?.document) {
    return null
  }
  const value = getSlotValue(envelope.document, slot)
  if (!value?.value_free_text) {
    return null
  }
  const normalizedText = normalizeCurationText(value.value_free_text)
  if (normalizedText !== term.normalizedText && !(term.aliases || []).includes(normalizedText)) {
    return null
  }

  const metadataV2 = cloneDeep(envelope)
  setSlotValue(metadataV2.document, slot, resolvedValue(value, term))
  const metadata = cloneDeep(engineDataset.metadata)
  const field = projectLegacyField(metadataV2, term.slot)
  if (field && metadata) {
    const [section, key] = field.path
    metadata[section] = { ...metadata[section], [key]: field.value }
  }
  return { metadata, metadataV2 }
}

/**
 * Ends the run, unless the row is no longer `running`: an owner re-save meanwhile resets the row to pending/idle,
 * and that reset must win over the outcome of the apply that started before it. A null `appliedCount` keeps the
 * stored count.
 */
const finishApply = async(em: EntityManager, termId: string, applyState: 'done' | 'failed',
  appliedCount: number | null): Promise<void> => {
  await em.query(`UPDATE public.metadata_curation_term
    SET apply_state = $2, applied_count = COALESCE($3::integer, applied_count)
    WHERE id = $1 AND apply_state = 'running'`, [termId, applyState, appliedCount])
}

/**
 * Rewrites the row's dataset with its decision. A dataset whose value no longer carries the text is skipped
 * (`done` with `appliedCount` 0); a failed engine update is logged and ends the run `failed`. Never rejects: it
 * runs in the background after the decision.
 */
export async function applyCurationTerm(em: EntityManager, termId: string): Promise<void> {
  try {
    const term = await em.findOne(MetadataCurationTerm, termId)
    if (!term) {
      return
    }
    await em.update(MetadataCurationTerm, termId, { applyState: 'running', appliedCount: 0 })

    const { datasetId } = term
    const engineDataset = await em.findOne(EngineDataset, datasetId)
    const patch = engineDataset ? patchDatasetForTerm(engineDataset, term) : null
    let appliedCount = 0
    let failed = false
    if (patch) {
      try {
        await smApiDatasetRequest(`/v1/datasets/${datasetId}/update`, {
          doc: { metadata: patch.metadata, metadataV2: patch.metadataV2 },
          async_es_update: true,
        })
        appliedCount = 1
      } catch (err) {
        failed = true
        logger.error(`Applying metadata curation term ${termId} to dataset ${datasetId} failed`, err)
      }
    }

    await finishApply(em, termId, failed ? 'failed' : 'done', appliedCount)
  } catch (err) {
    logger.error(`Applying metadata curation term ${termId} failed`, err)
    try {
      await finishApply(em, termId, 'failed', null)
    } catch (updateErr) {
      logger.error(`Marking metadata curation term ${termId} as failed failed`, updateErr)
    }
  }
}
