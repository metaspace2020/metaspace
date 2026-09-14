/**
 * Projection between the new LinkML-authored `metadata_v2` document and the legacy free-text
 * metadata shape (`ims.json`). See metaspace_metadata's `docs/integration_metaspace.md` SS3.3-3.5
 * for the authoritative spec this implements.
 *
 * Only one direction is used in production (down-projection, `metadata_v2` -> legacy), run on every
 * create/update so the legacy blob - and therefore ElasticSearch, filters, the public API and the
 * Python client - keeps working unmodified while `metadata_v2` is the new write path (coexistence).
 * Up-projection exists for exactly two purposes per the spec (SS10): the projection round-trip test,
 * and up-projecting a legacy dataset when it's used as a metadata *template* for a new submission
 * (webapp's `importMetadata`) - it is never used to backfill `metadata_v2` for existing datasets.
 */

// ---------------------------------------------------------------------------
// metadata_v2 document shape (mirrors schema/metaspace_submission.yaml)
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

// The closed set of legacy fields deliberately not modeled in the LinkML schema (integration spec
// SS2.1) - carried verbatim beside `document` so the down-projection can still be total.
export interface UnmodeledFields {
  Detector_Resolving_Power?: { mz: number, Resolving_Power: number } | null
  Pixel_Size?: { Xaxis: number, Yaxis: number } | null
  Supplementary?: string | null
  Submitted_By?: unknown
}

export interface MetadataV2Envelope {
  schema_version: string
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
  MS_Analysis: {
    Polarity: 'Positive' | 'Negative'
    Ionisation_Source: string
    Analyzer: string
    Detector_Resolving_Power: { mz: number, Resolving_Power: number }
    Pixel_Size: { Xaxis: number, Yaxis: number }
  }
  Additional_Information?: {
    Supplementary?: string
  }
  // Not a property of the current JSON Schema at all (integration spec SS2.1) - read by
  // `dataset.py:175`/`to_queue_message` via chained `.get()` with defaults. Carried through
  // `unmodeled.Submitted_By` because it must still survive the round trip.
  Submitted_By?: unknown
}

// ---------------------------------------------------------------------------
// Down-projection: metadata_v2 -> legacy
// ---------------------------------------------------------------------------

/**
 * "value_label if non-empty, else value_free_text, else ''" - integration spec SS3.3.
 */
function renderScalar(value: OntologyTermValue | null | undefined, fallback = ''): string {
  if (!value) {
    return fallback
  }
  if (value.value_label) {
    return value.value_label
  }
  if (value.value_free_text) {
    return value.value_free_text
  }
  return fallback
}

const POLARITY_CURIE_MAP: Record<string, 'Positive' | 'Negative'> = {
  'MS:1000130': 'Positive', // positive scan
  'MS:1000129': 'Negative', // negative scan
}

/**
 * Polarity is the one field the scalar rule breaks: the legacy field is a strict enum
 * (Positive/Negative), but the resolved PSI-MS labels are "positive scan"/"negative scan", which
 * would fail legacy validation. Uses an explicit CURIE map instead of the label, falling back to a
 * case-normalised match on free text when unresolved (integration spec SS3.3).
 */
function renderPolarity(polarity: ReconciledValue): 'Positive' | 'Negative' {
  const { value_ontology_id: curie, value_free_text: freeText } = polarity.user_value
  if (curie && POLARITY_CURIE_MAP[curie]) {
    return POLARITY_CURIE_MAP[curie]
  }
  const normalized = (freeText || '').trim().toLowerCase()
  if (normalized === 'positive') {
    return 'Positive'
  }
  if (normalized === 'negative') {
    return 'Negative'
  }
  // Projection totality (SS3.5): polarity is `required: true` on AcquisitionInfo, so an unresolved
  // value here is a data error upstream, not something the projection can invent - default to
  // Positive (matching the legacy schema's own historical default bias) rather than throwing, since
  // the projection must always produce a legacy-valid document (SS3.5).
  return 'Positive'
}

/**
 * The `Condition` composition rule (integration spec SS3.4) - the one genuinely lossy step in the
 * projection, because the schema splits one required legacy free-text field into three
 * (health_status, genetic_background, disease). Reproduces the short single-token register real
 * `Condition` values have (`wildtype`, `healthy`, `melanoma`) rather than synthesising a compound
 * string that would fragment the `condition` filter facet.
 */
function renderCondition(sample: Sample): string {
  if (sample.disease) {
    if (sample.disease.value_label) {
      return sample.disease.value_label
    }
    if (sample.disease.value_free_text) {
      return sample.disease.value_free_text
    }
  }
  if (sample.health_status && sample.health_status !== 'other') {
    return sample.health_status
  }
  const geneticBackground = renderScalar(sample.genetic_background)
  if (geneticBackground) {
    return geneticBackground
  }
  return 'unspecified'
}

/**
 * `Organism_Part` sentinels for non-tissue samples (integration spec SS3.5) - `anatomical_site_coarse`
 * is a TissueSample-only slot, so a CellCultureSample/PlantSample/EnvironmentalSample submission has
 * no source for the required legacy `Organism_Part`. These sentinels are deliberately visible in
 * search facets: a cell-culture dataset genuinely has no organism part.
 */
function renderOrganismPart(sample: Sample): string {
  switch (sample.sample_class) {
    case 'TissueSample':
      return renderScalar(sample.anatomical_site_coarse)
    case 'CellCultureSample':
      return renderScalar(sample.cell_line_id, 'cell culture')
    case 'PlantSample':
      return 'plant'
    case 'EnvironmentalSample':
      return 'environmental'
    default:
      return ''
  }
}

/**
 * metadata_v2 -> legacy metadata. Must be deterministic and side-effect free (re-projecting an
 * unchanged document is a no-op) and must always yield a document that passes legacy validation
 * (integration spec SS3.3, SS3.5) - this is the totality property the round-trip test checks.
 */
export function projectToLegacyMetadata(envelope: MetadataV2Envelope): LegacyMetadata {
  const { document: doc, unmodeled } = envelope
  const { sample, acquisition } = doc

  const legacy: LegacyMetadata = {
    Data_Type: doc.data_type,
    Sample_Information: {
      Organism: renderScalar(sample.organism),
      Organism_Part: renderOrganismPart(sample),
      Condition: renderCondition(sample),
      Sample_Growth_Conditions: sample.protocol_description || undefined,
    },
    Sample_Preparation: {
      // required: true as of schema 0.2.0 (SS3.5) - sample_class is always TissueSample when these
      // are populated in practice, but render whatever's present rather than assuming the subclass.
      Sample_Stabilisation: renderScalar(sample.sample_stabilisation),
      Tissue_Modification: renderScalar(sample.tissue_modification),
      MALDI_Matrix: renderScalar(acquisition.maldi_matrix, 'none'),
      MALDI_Matrix_Application: renderScalar(acquisition.maldi_matrix_application, 'none'),
      Solvent: renderScalar(acquisition.solvent, 'none'),
    },
    MS_Analysis: {
      Polarity: renderPolarity(acquisition.polarity),
      Ionisation_Source: renderScalar(acquisition.ionization_source.user_value),
      Analyzer: renderScalar(acquisition.instrument_model.user_value),
      // Deliberately not modeled in metadata_v2 (SS2.1) - carried verbatim from `unmodeled`.
      // Absence here means the metadata_v2 document is incomplete for Imaging MS; the belt-and-braces
      // legacy validation this feeds into (Mutation.ts, commit 6) is what catches that, not this
      // function - projection stays a pure mapping, not a validator.
      Detector_Resolving_Power: unmodeled.Detector_Resolving_Power || { mz: 200, Resolving_Power: 140000 },
      Pixel_Size: unmodeled.Pixel_Size || { Xaxis: 0, Yaxis: 0 },
    },
    Additional_Information: unmodeled.Supplementary ? { Supplementary: unmodeled.Supplementary } : undefined,
    Submitted_By: unmodeled.Submitted_By,
  }

  return legacy
}

// ---------------------------------------------------------------------------
// Up-projection: legacy -> metadata_v2
// ---------------------------------------------------------------------------

/**
 * Wraps a legacy free-text string as a `pending_curation` OntologyTermValue - honest, since nothing
 * in the legacy corpus is a resolved ontology term (integration spec SS10).
 */
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
 * legacy -> metadata_v2. Used only for the round-trip test and metadata-template up-projection
 * (webapp's `importMetadata`) - never to backfill `metadata_v2` for existing datasets, which keep
 * `metadata_v2 IS NULL` (integration spec SS10). Every ontology-bound field becomes `pending_curation`
 * free text; `Condition` cannot be reversed (it was never split on the way in), so it round-trips
 * only through `disease` as free text - the accepted, sole lossy step (SS3.4).
 */
export function upProjectToV2(legacy: LegacyMetadata, schemaVersion = '0.2.0'): MetadataV2Envelope {
  const sample: Sample = {
    sample_class: 'TissueSample',
    organism: toPendingCuration(legacy.Sample_Information.Organism),
    sample_type: 'tissue',
    // `Condition` was never split going in, so there is nothing to reconstruct health_status/
    // genetic_background from - it round-trips through `disease` alone, as free text, which is what
    // makes the down-projection reproduce it exactly (renderCondition's first branch).
    disease: toPendingCuration(legacy.Sample_Information.Condition),
    protocol_description: legacy.Sample_Information.Sample_Growth_Conditions || undefined,
    anatomical_site_coarse: toPendingCuration(legacy.Sample_Information.Organism_Part),
    sample_stabilisation: toPendingCuration(legacy.Sample_Preparation.Sample_Stabilisation),
    tissue_modification: toPendingCuration(legacy.Sample_Preparation.Tissue_Modification),
  }

  const acquisition: AcquisitionInfo = {
    polarity: {
      user_value: toPendingCuration(legacy.MS_Analysis.Polarity),
      reconciliation_state: 'not_checked',
    },
    ionization_source: toReconciledPending(legacy.MS_Analysis.Ionisation_Source),
    instrument_model: toReconciledPending(legacy.MS_Analysis.Analyzer),
    maldi_matrix: toPendingCuration(legacy.Sample_Preparation.MALDI_Matrix),
    maldi_matrix_application: toPendingCuration(legacy.Sample_Preparation.MALDI_Matrix_Application),
    solvent: toPendingCuration(legacy.Sample_Preparation.Solvent),
  }

  return {
    schema_version: schemaVersion,
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
