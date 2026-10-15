/**
 * Projection between the LinkML-authored `metadata_v2` document and the legacy metadata shape
 * (`ims.json`). Down-projection (v2 -> legacy) runs on every create/update that carries metadata_v2:
 * the stored legacy blob is derived from it, so Elasticsearch, filters, the public API and the Python
 * client keep working unchanged. Up-projection (legacy -> v2) exists for the round-trip test and for
 * using a legacy dataset as a template in the webapp; it is never used to backfill stored datasets.
 */

// ---------------------------------------------------------------------------
// metadata_v2 document shape (mirrors metaspace/metadata/linkml/generated/metaspace_submission.schema.json)
// ---------------------------------------------------------------------------

export type CurationState = 'controlled' | 'pending_curation' | 'free_text_accepted'
export type ReconciliationState = 'not_checked' | 'matched' | 'mismatched' | 'file_value_absent'
export type SampleType = 'tissue' | 'cell_culture' | 'plant' | 'environmental'
export type SampleClass = 'TissueSample' | 'CellCultureSample' | 'PlantSample' | 'EnvironmentalSample'
export type HealthStatus = 'control' | 'disease' | 'disease_model' | 'treated' | 'other'
export type Sex = 'female' | 'male' | 'mixed' | 'unknown'

export interface OntologyTermValue {
  value_ontology_id?: string | null
  value_label?: string | null
  value_free_text?: string | null
  curation_state: CurationState
}

export interface ReconciledValue {
  user_value: OntologyTermValue
  file_observed_value?: string | null
  reconciliation_state: ReconciliationState
}

export interface Sample {
  sample_class: SampleClass
  organism: OntologyTermValue
  sample_type: SampleType
  health_status?: HealthStatus | null
  genetic_background?: OntologyTermValue | null
  disease?: OntologyTermValue | null
  protocol_description?: string | null
  // TissueSample-only
  anatomical_site_coarse?: OntologyTermValue | null
  anatomical_site_fine?: OntologyTermValue | null
  sample_stabilisation?: OntologyTermValue | null
  tissue_modification?: OntologyTermValue | null
  developmental_stage?: OntologyTermValue | null
  sex?: Sex | null
  // CellCultureSample-only
  cell_line_id?: OntologyTermValue | null
  passage_number?: number | null
}

export interface AcquisitionInfo {
  polarity: ReconciledValue
  ionization_source: ReconciledValue
  instrument_model: ReconciledValue
  maldi_matrix?: OntologyTermValue | null
  maldi_matrix_application?: OntologyTermValue | null
  solvent?: OntologyTermValue | null
}

export interface MetadataV2Document {
  schema_version: string
  data_type: 'Imaging MS'
  dataset_name?: string | null
  sample: Sample
  acquisition: AcquisitionInfo
}

// Legacy fields deliberately not modeled in the LinkML schema, carried beside `document` so the
// down-projection can still produce a complete legacy document.
export interface UnmodeledFields {
  Detector_Resolving_Power?: { mz: number, Resolving_Power: number } | null
  Pixel_Size?: { Xaxis: number, Yaxis: number } | null
  Supplementary?: string | null
  Submitted_By?: unknown
}

export interface MetadataV2Envelope {
  document: MetadataV2Document
  unmodeled: UnmodeledFields
}

// ---------------------------------------------------------------------------
// Legacy metadata shape (ims.json)
// ---------------------------------------------------------------------------

export interface LegacyMetadata {
  Data_Type: 'Imaging MS'
  Sample_Information: {
    Organism: string
    Organism_Part: string
    Condition: string
    Sample_Growth_Conditions?: string
  }
  Sample_Preparation: {
    Sample_Stabilisation: string
    Tissue_Modification: string
    MALDI_Matrix: string
    MALDI_Matrix_Application: string
    Solvent?: string
  }
  // Optional only so a projection of an incomplete v2 document can leave them out and let the
  // ims.json validation report them, rather than inventing processing-critical values.
  MS_Analysis: {
    Polarity?: 'Positive' | 'Negative'
    Ionisation_Source: string
    Analyzer: string
    Detector_Resolving_Power?: { mz: number, Resolving_Power: number }
    Pixel_Size?: { Xaxis: number, Yaxis: number }
  }
  Additional_Information?: {
    Supplementary?: string
  }
  // Not in ims.json, but the engine reads it (dataset.py `to_queue_message`), so it must survive.
  Submitted_By?: unknown
}

// ---------------------------------------------------------------------------
// Down-projection: metadata_v2 -> legacy
// ---------------------------------------------------------------------------

/** value_label if non-empty, else value_free_text, else `fallback`. */
function renderScalar(value: OntologyTermValue | null | undefined, fallback = ''): string {
  if (!value) {
    return fallback
  }
  return value.value_label || value.value_free_text || fallback
}

const POLARITY_CURIE_MAP: Record<string, 'Positive' | 'Negative'> = {
  'MS:1000130': 'Positive', // positive scan
  'MS:1000129': 'Negative', // negative scan
}

/**
 * The legacy field is a strict enum, while the PSI-MS labels are "positive scan"/"negative scan",
 * so polarity maps by CURIE first, then by the label or free text. Unresolved stays undefined so
 * the legacy validation reports it instead of guessing.
 */
function renderPolarity(polarity: ReconciledValue): 'Positive' | 'Negative' | undefined {
  const { value_ontology_id: curie, value_label: label, value_free_text: freeText } = polarity.user_value
  if (curie && POLARITY_CURIE_MAP[curie]) {
    return POLARITY_CURIE_MAP[curie]
  }
  const normalized = `${label || ''} ${freeText || ''}`.toLowerCase()
  if (/\bneg/.test(normalized)) {
    return 'Negative'
  }
  if (/\bpos/.test(normalized)) {
    return 'Positive'
  }
  return undefined
}

/**
 * The legacy `Condition` field is split into disease / health_status / genetic_background in v2.
 * Pick one short value (disease first) rather than a compound string, so the `condition` facet
 * keeps the single-token register real values have (`wildtype`, `healthy`, `melanoma`).
 */
function renderCondition(sample: Sample): string {
  const disease = renderScalar(sample.disease)
  if (disease) {
    return disease
  }
  if (sample.health_status && sample.health_status !== 'other') {
    return sample.health_status
  }
  return renderScalar(sample.genetic_background) || 'unspecified'
}

/**
 * `anatomical_site_coarse` is a tissue-only slot, so other sample types get a visible sentinel for
 * the required legacy `Organism_Part`. Keyed on `sample_type`, which the schema requires
 * (`sample_class` is optional).
 */
function renderOrganismPart(sample: Sample): string {
  switch (sample.sample_type) {
    case 'tissue':
      return renderScalar(sample.anatomical_site_coarse)
    case 'cell_culture':
      return renderScalar(sample.cell_line_id, 'cell culture')
    case 'plant':
      return 'plant'
    case 'environmental':
      return 'environmental'
    default:
      return ''
  }
}

/**
 * metadata_v2 -> legacy metadata. Deterministic and side-effect free. It is a pure mapping, not a
 * validator: unresolved polarity or a missing `unmodeled` value is left undefined so the ims.json
 * validation that follows reports it, rather than inventing a processing-critical default.
 */
export function projectToLegacyMetadata(envelope: MetadataV2Envelope): LegacyMetadata {
  const { document: doc, unmodeled } = envelope
  const { sample, acquisition } = doc
  const nonTissueFallback = sample.sample_type === 'tissue' ? '' : 'N/A'

  return {
    Data_Type: doc.data_type,
    Sample_Information: {
      Organism: renderScalar(sample.organism),
      Organism_Part: renderOrganismPart(sample),
      Condition: renderCondition(sample),
      Sample_Growth_Conditions: sample.protocol_description || undefined,
    },
    Sample_Preparation: {
      // tissue-only slots: other sample types get 'N/A' so the required legacy fields still validate
      Sample_Stabilisation: renderScalar(sample.sample_stabilisation, nonTissueFallback),
      Tissue_Modification: renderScalar(sample.tissue_modification, nonTissueFallback),
      MALDI_Matrix: renderScalar(acquisition.maldi_matrix, 'none'),
      MALDI_Matrix_Application: renderScalar(acquisition.maldi_matrix_application, 'none'),
      Solvent: renderScalar(acquisition.solvent, 'none'),
    },
    MS_Analysis: {
      Polarity: renderPolarity(acquisition.polarity),
      Ionisation_Source: renderScalar(acquisition.ionization_source.user_value),
      Analyzer: renderScalar(acquisition.instrument_model.user_value),
      Detector_Resolving_Power: unmodeled.Detector_Resolving_Power || undefined,
      Pixel_Size: unmodeled.Pixel_Size || undefined,
    },
    Additional_Information: unmodeled.Supplementary ? { Supplementary: unmodeled.Supplementary } : undefined,
    Submitted_By: unmodeled.Submitted_By,
  }
}

// ---------------------------------------------------------------------------
// Up-projection: legacy -> metadata_v2
// ---------------------------------------------------------------------------

/** Legacy free text becomes a `pending_curation` value: nothing in the legacy corpus is a resolved term. */
function toPendingCuration(freeText: string | undefined | null): OntologyTermValue {
  return {
    value_free_text: freeText || undefined,
    curation_state: 'pending_curation',
  }
}

function toReconciledPending(freeText: string | undefined | null): ReconciledValue {
  return {
    user_value: toPendingCuration(freeText),
    reconciliation_state: 'not_checked',
  }
}

/**
 * legacy -> metadata_v2, for the round-trip test and for templating a new submission from a legacy
 * dataset. `Condition` was never split on the way in, so it round-trips through `disease` as free
 * text, which `renderCondition` checks first.
 */
export function upProjectToV2(legacy: LegacyMetadata, schemaVersion = '0.2.0'): MetadataV2Envelope {
  const sample: Sample = {
    sample_class: 'TissueSample',
    organism: toPendingCuration(legacy.Sample_Information.Organism),
    sample_type: 'tissue',
    disease: toPendingCuration(legacy.Sample_Information.Condition),
    protocol_description: legacy.Sample_Information.Sample_Growth_Conditions || undefined,
    anatomical_site_coarse: toPendingCuration(legacy.Sample_Information.Organism_Part),
    sample_stabilisation: toPendingCuration(legacy.Sample_Preparation.Sample_Stabilisation),
    tissue_modification: toPendingCuration(legacy.Sample_Preparation.Tissue_Modification),
  }

  const acquisition: AcquisitionInfo = {
    polarity: toReconciledPending(legacy.MS_Analysis.Polarity),
    ionization_source: toReconciledPending(legacy.MS_Analysis.Ionisation_Source),
    instrument_model: toReconciledPending(legacy.MS_Analysis.Analyzer),
    maldi_matrix: toPendingCuration(legacy.Sample_Preparation.MALDI_Matrix),
    maldi_matrix_application: toPendingCuration(legacy.Sample_Preparation.MALDI_Matrix_Application),
    solvent: toPendingCuration(legacy.Sample_Preparation.Solvent),
  }

  return {
    document: {
      schema_version: schemaVersion,
      data_type: 'Imaging MS',
      sample,
      acquisition,
    },
    unmodeled: {
      Detector_Resolving_Power: legacy.MS_Analysis.Detector_Resolving_Power,
      Pixel_Size: legacy.MS_Analysis.Pixel_Size,
      Supplementary: legacy.Additional_Information?.Supplementary,
      Submitted_By: legacy.Submitted_By,
    },
  }
}
