import { getAtPath, isTermEmpty } from './envelope'
import { FieldDef, requiredFor } from './formDefinition'
import { FieldKey, FieldReport, MetadataV2Envelope, SampleType } from './types'

export interface StatusInput {
  envelope: MetadataV2Envelope
  fields: Partial<Record<FieldKey, FieldReport>>
  /** layout sample type; defaults to the envelope's (tissue when the select is cleared) */
  sampleType?: SampleType
}

export interface StatusSummary {
  requiredTotal: number
  requiredFilled: number
  missingRequired: FieldDef[]
  migratedCount: number
}

export function isFieldFilled(envelope: MetadataV2Envelope, def: FieldDef): boolean {
  // a typed (pending curation) sample type fills the field even though the select holds only the class
  if (def.key === 'sample_type' && !isTermEmpty(envelope.unmodeled.sample_type_other)) {
    return true
  }
  const value = getAtPath<any>(envelope, def.path)
  switch (def.editor) {
    case 'enum':
      return typeof value === 'string' ? value !== '' : !isTermEmpty(value)
    case 'ontology':
    case 'freeText':
      return !isTermEmpty(value)
    case 'textarea':
      return !!(value || '').trim()
    case 'integer':
      return value != null
    case 'resolvingPower':
      return value?.mz != null && value?.Resolving_Power != null
    case 'pixelSize':
      return value?.Xaxis != null && value?.Yaxis != null
    default:
      return false
  }
}

export function computeStatus({ envelope, fields, sampleType }: StatusInput): StatusSummary {
  const required = requiredFor(sampleType || envelope.document.sample.sample_type || 'tissue')
  const missingRequired = required.filter((def) => !isFieldFilled(envelope, def))
  const migratedCount = Object.values(fields).filter((report) => report?.state === 'migrated').length
  const requiredFilled = required.length - missingRequired.length
  return {
    requiredTotal: required.length,
    requiredFilled,
    missingRequired,
    migratedCount,
  }
}
