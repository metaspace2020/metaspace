// metaspace/webapp/src/modules/MetadataEditor/v2/types.ts
/* eslint-disable camelcase */
import { CurationState, OntologyTermValue } from '../formStructure'

export type { CurationState, OntologyTermValue }

export type ReconciliationState = 'not_checked' | 'matched' | 'mismatched' | 'file_value_absent'
export interface ReconciledValue {
  user_value: OntologyTermValue
  file_observed_value?: string | null
  reconciliation_state: ReconciliationState
}

export type SampleType = 'tissue' | 'cell_culture' | 'plant' | 'environmental'
export type SampleClass = 'TissueSample' | 'CellCultureSample' | 'PlantSample' | 'EnvironmentalSample'
export type HealthStatus = 'control' | 'disease' | 'disease_model' | 'treated' | 'other'
export type Sex = 'female' | 'male' | 'mixed' | 'unknown'

export interface SampleV2 {
  /** optional in the schema; absent until a sample type is chosen on a new form */
  sample_class?: SampleClass
  /** absent only while the user has cleared the select; required by the schema */
  sample_type?: SampleType
  organism: OntologyTermValue
  health_status?: HealthStatus | null
  genetic_background?: OntologyTermValue | null
  disease?: OntologyTermValue | null
  protocol_description?: string | null
  anatomical_site_coarse?: OntologyTermValue | null
  anatomical_site_fine?: OntologyTermValue | null
  sample_stabilisation?: OntologyTermValue | null
  tissue_modification?: OntologyTermValue | null
  developmental_stage?: OntologyTermValue | null
  sex?: Sex | null
  cell_line_id?: OntologyTermValue | null
  passage_number?: number | null
}

export interface AcquisitionV2 {
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
  sample: SampleV2
  acquisition: AcquisitionV2
}

export interface ResolvingPower {
  mz: number | null
  Resolving_Power: number | null
}
export interface PixelSizeValue {
  Xaxis: number | null
  Yaxis: number | null
}

export interface LegacyMetadata {
  Data_Type?: string
  Sample_Information?: {
    Organism?: string
    Organism_Part?: string
    Condition?: string
    Sample_Growth_Conditions?: string
  }
  Sample_Preparation?: {
    Sample_Stabilisation?: string
    Tissue_Modification?: string
    MALDI_Matrix?: string
    MALDI_Matrix_Application?: string
    Solvent?: string
  }
  MS_Analysis?: {
    Polarity?: string
    Ionisation_Source?: string
    Analyzer?: string
    Detector_Resolving_Power?: ResolvingPower
    Pixel_Size?: PixelSizeValue
  }
  Additional_Information?: { Supplementary?: string }
  Submitted_By?: unknown
}

export interface LegacyRecordStash {
  metadata: LegacyMetadata
  migrated_at: string
}

export interface UnmodeledV2 {
  Detector_Resolving_Power?: ResolvingPower | null
  Pixel_Size?: PixelSizeValue | null
  Supplementary?: string | null
  Submitted_By?: unknown
  legacy_record?: LegacyRecordStash
  /**
   * A sample type typed by the user that is not one of the curated classes. The schema's sample_type is a
   * closed enum, so the typed value waits here for curation while document.sample.sample_type keeps the
   * class that drives the field layout.
   */
  sample_type_other?: OntologyTermValue | null
}

export interface MetadataV2Envelope {
  document: MetadataV2Document
  unmodeled: UnmodeledV2
}

export type FieldKey =
  | 'sample_type'
  | 'organism'
  | 'anatomical_site_coarse'
  | 'anatomical_site_fine'
  | 'sample_stabilisation'
  | 'tissue_modification'
  | 'developmental_stage'
  | 'sex'
  | 'health_status'
  | 'genetic_background'
  | 'disease'
  | 'protocol_description'
  | 'cell_line_id'
  | 'passage_number'
  | 'polarity'
  | 'ionization_source'
  | 'instrument_model'
  | 'resolving_power'
  | 'pixel_size'
  | 'maldi_matrix'
  | 'maldi_matrix_application'
  | 'solvent'

export type FieldState = 'migrated' | 'review' | 'required-empty' | 'empty' | 'new' | 'copied'

export interface Term {
  curie: string
  label: string
  synonyms: string[]
}
export type TermResolver = (slot: string, query: string) => Promise<Term[]>

/** A plain-text suggestion (curated seed list or values other users entered); it carries no ontology id. */
export interface ValueSuggestion {
  label: string
}
/** Suggestions for a free-text field that has no ontology slot, e.g. sample stabilisation. */
export type ValueResolver = (fieldKey: FieldKey, query: string) => Promise<ValueSuggestion[]>

export interface FieldReport {
  state: FieldState
  source?: { legacyKey: string; raw: string }
  suggestion?: Term
  note?: string
}

export interface UnmappedRow {
  legacyKey: string // dotted legacy path, e.g. 'Sample_Information.Condition'
  label: string // 'Condition'
  raw: string
  hint: string
  targets: FieldKey[] // ranked
  safeToDismiss: boolean
}

export interface MigrationResult {
  envelope: MetadataV2Envelope
  fields: Partial<Record<FieldKey, FieldReport>>
  unmapped: UnmappedRow[]
  failedSlots: string[]
}

export type EditorMode = 'new' | 'v2' | 'legacy'
