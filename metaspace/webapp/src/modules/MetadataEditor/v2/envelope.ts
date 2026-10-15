// metaspace/webapp/src/modules/MetadataEditor/v2/envelope.ts
/* eslint-disable camelcase */
import { cloneDeep, get, set, unset } from 'lodash-es'
import { MetadataV2Envelope, OntologyTermValue, ReconciledValue, SampleClass, SampleType, SampleV2 } from './types'

export const SCHEMA_VERSION = '0.2.0'

export const SAMPLE_CLASS: Record<SampleType, SampleClass> = {
  tissue: 'TissueSample',
  cell_culture: 'CellCultureSample',
  plant: 'PlantSample',
  environmental: 'EnvironmentalSample',
}

// PSI-MS scan polarity terms; the legacy projection maps these CURIEs back to Positive/Negative.
export const POLARITY_TERMS: Record<'Positive' | 'Negative', OntologyTermValue> = {
  Positive: { value_ontology_id: 'MS:1000130', value_label: 'positive scan', curation_state: 'controlled' },
  Negative: { value_ontology_id: 'MS:1000129', value_label: 'negative scan', curation_state: 'controlled' },
}

export const emptyTermValue = (): OntologyTermValue => ({ curation_state: 'pending_curation' })

export const emptyReconciled = (): ReconciledValue => ({
  user_value: emptyTermValue(),
  reconciliation_state: 'not_checked',
})

const emptySample = (sampleType: SampleType): SampleV2 => {
  const shared: SampleV2 = {
    sample_class: SAMPLE_CLASS[sampleType],
    sample_type: sampleType,
    organism: emptyTermValue(),
  }
  if (sampleType === 'tissue') {
    return {
      ...shared,
      anatomical_site_coarse: emptyTermValue(),
      sample_stabilisation: emptyTermValue(),
      tissue_modification: emptyTermValue(),
    }
  }
  if (sampleType === 'cell_culture') {
    return { ...shared, cell_line_id: emptyTermValue() }
  }
  return shared
}

export function createEmptyEnvelope(sampleType: SampleType = 'tissue'): MetadataV2Envelope {
  return {
    document: {
      schema_version: SCHEMA_VERSION,
      data_type: 'Imaging MS',
      sample: emptySample(sampleType),
      acquisition: {
        polarity: emptyReconciled(),
        ionization_source: emptyReconciled(),
        instrument_model: emptyReconciled(),
      },
    },
    unmodeled: {
      // ims.json defaults, kept so the ppm recommendation and legacy validation behave as today
      Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
      Pixel_Size: { Xaxis: null, Yaxis: null },
    },
  }
}

/** Shared fields survive a sample-type switch; type-specific ones are dropped. */
export function switchSampleType(envelope: MetadataV2Envelope, sampleType: SampleType): MetadataV2Envelope {
  const prev = envelope.document.sample
  const next = emptySample(sampleType)
  const shared: (keyof SampleV2)[] = [
    'organism',
    'health_status',
    'genetic_background',
    'disease',
    'protocol_description',
  ]
  shared.forEach((key) => {
    if (prev[key] !== undefined) {
      ;(next as any)[key] = cloneDeep(prev[key])
    }
  })
  return { ...cloneDeep(envelope), document: { ...cloneDeep(envelope.document), sample: next } }
}

export function getAtPath<T = unknown>(envelope: MetadataV2Envelope, path: string): T {
  return get(envelope, path) as T
}

export function setAtPath(envelope: MetadataV2Envelope, path: string, value: unknown): MetadataV2Envelope {
  const next = cloneDeep(envelope)
  set(next, path, value)
  return next
}

export function unsetAtPath(envelope: MetadataV2Envelope, path: string): MetadataV2Envelope {
  const next = cloneDeep(envelope)
  unset(next, path)
  return next
}

export function isTermEmpty(value: OntologyTermValue | null | undefined): boolean {
  if (value == null) {
    return true
  }
  return !value.value_ontology_id && !(value.value_label || '').trim() && !(value.value_free_text || '').trim()
}

export function termText(value: OntologyTermValue | null | undefined): string {
  return (value?.value_label || value?.value_free_text || '').trim()
}

export function appendProtocol(envelope: MetadataV2Envelope, line: string): MetadataV2Envelope {
  const current = (envelope.document.sample.protocol_description || '').trim()
  const text = line.trim()
  if (!text) {
    return envelope
  }
  return setAtPath(envelope, 'document.sample.protocol_description', current ? `${current} ${text}` : text)
}

export function polarityOf(envelope: MetadataV2Envelope): 'Positive' | 'Negative' | null {
  const curie = envelope.document.acquisition.polarity?.user_value?.value_ontology_id
  if (curie === POLARITY_TERMS.Positive.value_ontology_id) {
    return 'Positive'
  }
  if (curie === POLARITY_TERMS.Negative.value_ontology_id) {
    return 'Negative'
  }
  return null
}
