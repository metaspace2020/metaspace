// metaspace/webapp/src/modules/MetadataEditor/v2/formDefinition.ts
import { FieldKey, SampleType } from './types'

export type FieldTier = 'core' | 'recommended' | 'advanced'
export type EditorKind = 'enum' | 'ontology' | 'freeText' | 'textarea' | 'integer' | 'resolvingPower' | 'pixelSize'

export interface FieldDef {
  key: FieldKey
  label: string
  group: 'sample' | 'acquisition'
  tier: FieldTier
  editor: EditorKind
  /** lodash path inside the envelope */
  path: string
  /** ontologyTermSuggestions slot; undefined = unbound (free text only) */
  slot?: string
  enumOptions?: { value: string; label: string; disabled?: boolean }[]
  appliesTo: SampleType[] | 'all'
  requiredFor: SampleType[] | 'all' | 'none'
  /** dotted ims.json path this field migrates from and whose server errors it displays */
  legacyPath?: string
  /**
   * 'community': a free-text field without ontology that suggests curated seed values plus values other users
   * entered (metadataSuggestions on `legacyPath`)
   */
  valueSource?: 'community'
  /** legacy field whose community values back the suggestions when it differs from `legacyPath` */
  communityPath?: string
  placeholder: string
  fullWidth?: boolean
}

// Hard-coded copies of the vendored schema enums; formDefinition.spec.ts fails when they drift.
export const ENUM_VALUES = {
  SampleType: ['tissue', 'cell_culture', 'plant', 'environmental'],
  PolarityEnum: ['Positive', 'Negative'],
  SexEnum: ['female', 'male', 'mixed', 'unknown'],
  HealthStatusEnum: ['control', 'disease', 'disease_model', 'treated', 'other'],
}

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// All four types are selectable; graphql's legacy projection fills tissue-only slots with 'N/A' for the others.
export const SAMPLE_TYPE_OPTIONS = ENUM_VALUES.SampleType.map((value) => ({
  value,
  label: titleCase(value),
}))

const TISSUE: SampleType[] = ['tissue']
const CELL: SampleType[] = ['cell_culture']

export const FIELD_DEFS: FieldDef[] = [
  {
    key: 'sample_type',
    label: 'Sample type',
    group: 'sample',
    tier: 'core',
    editor: 'enum',
    path: 'document.sample.sample_type',
    enumOptions: SAMPLE_TYPE_OPTIONS,
    appliesTo: 'all',
    requiredFor: 'all',
    placeholder: 'Select a sample type',
  },
  {
    key: 'organism',
    label: 'Organism',
    group: 'sample',
    tier: 'core',
    editor: 'ontology',
    path: 'document.sample.organism',
    slot: 'organism',
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'Sample_Information.Organism',
    placeholder: 'Search NCBITaxon (e.g. Mus musculus)…',
  },
  {
    key: 'sample_stabilisation',
    label: 'Sample stabilisation',
    group: 'sample',
    tier: 'core',
    editor: 'freeText',
    path: 'document.sample.sample_stabilisation',
    appliesTo: TISSUE,
    requiredFor: TISSUE,
    legacyPath: 'Sample_Preparation.Sample_Stabilisation',
    valueSource: 'community',
    placeholder: 'Search or type (e.g. Fresh frozen, FFPE)…',
  },
  {
    key: 'tissue_modification',
    label: 'Tissue modification',
    group: 'sample',
    tier: 'core',
    editor: 'freeText',
    path: 'document.sample.tissue_modification',
    appliesTo: TISSUE,
    requiredFor: TISSUE,
    legacyPath: 'Sample_Preparation.Tissue_Modification',
    valueSource: 'community',
    placeholder: 'Search or type (e.g. None, Washed)…',
  },
  {
    key: 'anatomical_site_coarse',
    label: 'Anatomical site (coarse)',
    group: 'sample',
    tier: 'core',
    editor: 'ontology',
    path: 'document.sample.anatomical_site_coarse',
    slot: 'anatomical_site_coarse',
    appliesTo: TISSUE,
    requiredFor: TISSUE,
    legacyPath: 'Sample_Information.Organism_Part',
    placeholder: 'Search UBERON (e.g. liver, brain)…',
  },
  {
    key: 'cell_line_id',
    label: 'Cell line',
    group: 'sample',
    tier: 'core',
    editor: 'ontology',
    path: 'document.sample.cell_line_id',
    slot: 'cell_line_id',
    appliesTo: CELL,
    requiredFor: CELL,
    placeholder: 'Search cell lines (e.g. HeLa)…',
  },
  {
    key: 'anatomical_site_fine',
    label: 'Anatomical site (fine)',
    group: 'sample',
    tier: 'recommended',
    editor: 'ontology',
    path: 'document.sample.anatomical_site_fine',
    slot: 'anatomical_site_fine',
    appliesTo: TISSUE,
    requiredFor: 'none',
    placeholder: 'Search UBERON (e.g. hippocampus, cortex)…',
  },
  {
    key: 'developmental_stage',
    label: 'Developmental stage',
    group: 'sample',
    tier: 'recommended',
    editor: 'ontology',
    path: 'document.sample.developmental_stage',
    slot: 'developmental_stage',
    appliesTo: TISSUE,
    requiredFor: 'none',
    placeholder: 'Search EFO (e.g. adult, embryo)…',
  },
  {
    key: 'sex',
    label: 'Sex',
    group: 'sample',
    tier: 'recommended',
    editor: 'enum',
    path: 'document.sample.sex',
    enumOptions: ENUM_VALUES.SexEnum.map((value) => ({ value, label: titleCase(value) })),
    appliesTo: TISSUE,
    requiredFor: 'none',
    placeholder: 'Select',
  },
  {
    key: 'health_status',
    label: 'Health status',
    group: 'sample',
    tier: 'recommended',
    editor: 'enum',
    path: 'document.sample.health_status',
    enumOptions: ENUM_VALUES.HealthStatusEnum.map((value) => ({ value, label: titleCase(value) })),
    appliesTo: 'all',
    requiredFor: 'none',
    placeholder: 'Select',
  },
  {
    key: 'genetic_background',
    label: 'Genetic background',
    group: 'sample',
    tier: 'recommended',
    editor: 'freeText',
    path: 'document.sample.genetic_background',
    appliesTo: 'all',
    requiredFor: 'none',
    // legacy Condition held strain / genotype text ("Wildtype", "C57BL/6"), so its values are the community pool
    valueSource: 'community',
    communityPath: 'Sample_Information.Condition',
    placeholder: 'Search or type (e.g. C57BL/6J, Wild type)…',
  },
  {
    key: 'disease',
    label: 'Disease',
    group: 'sample',
    tier: 'recommended',
    editor: 'ontology',
    path: 'document.sample.disease',
    slot: 'disease',
    appliesTo: 'all',
    requiredFor: 'none',
    placeholder: 'Search MONDO (e.g. melanoma), if applicable…',
  },
  {
    key: 'passage_number',
    label: 'Passage number',
    group: 'sample',
    tier: 'recommended',
    editor: 'integer',
    path: 'document.sample.passage_number',
    appliesTo: CELL,
    requiredFor: 'none',
    placeholder: '',
  },
  {
    key: 'protocol_description',
    label: 'Protocol description',
    group: 'sample',
    tier: 'recommended',
    editor: 'textarea',
    path: 'document.sample.protocol_description',
    appliesTo: 'all',
    requiredFor: 'none',
    legacyPath: 'Sample_Information.Sample_Growth_Conditions',
    placeholder: 'Additional sample preparation, treatment or growth-condition details…',
    fullWidth: true,
  },
  {
    key: 'polarity',
    label: 'Polarity',
    group: 'acquisition',
    tier: 'core',
    editor: 'enum',
    path: 'document.acquisition.polarity.user_value',
    enumOptions: ENUM_VALUES.PolarityEnum.map((value) => ({ value, label: value })),
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'MS_Analysis.Polarity',
    placeholder: 'Select',
  },
  {
    key: 'ionization_source',
    label: 'Ionisation source',
    group: 'acquisition',
    tier: 'core',
    editor: 'ontology',
    path: 'document.acquisition.ionization_source.user_value',
    slot: 'ionization_source',
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'MS_Analysis.Ionisation_Source',
    placeholder: 'Search MS ontology (e.g. MALDI, DESI)…',
  },
  {
    key: 'instrument_model',
    label: 'Instrument model',
    group: 'acquisition',
    tier: 'core',
    editor: 'ontology',
    path: 'document.acquisition.instrument_model.user_value',
    slot: 'instrument_model',
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'MS_Analysis.Analyzer',
    placeholder: 'Search MS instruments (e.g. Q Exactive, timsTOF)…',
  },
  {
    key: 'resolving_power',
    label: 'Detector resolving power',
    group: 'acquisition',
    tier: 'core',
    editor: 'resolvingPower',
    path: 'unmodeled.Detector_Resolving_Power',
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'MS_Analysis.Detector_Resolving_Power',
    placeholder: '',
  },
  {
    key: 'pixel_size',
    label: 'Pixel size',
    group: 'acquisition',
    tier: 'core',
    editor: 'pixelSize',
    path: 'unmodeled.Pixel_Size',
    appliesTo: 'all',
    requiredFor: 'all',
    legacyPath: 'MS_Analysis.Pixel_Size',
    placeholder: '',
  },
  {
    key: 'maldi_matrix',
    label: 'MALDI matrix',
    group: 'acquisition',
    tier: 'recommended',
    editor: 'ontology',
    path: 'document.acquisition.maldi_matrix',
    slot: 'maldi_matrix',
    appliesTo: 'all',
    requiredFor: 'none',
    legacyPath: 'Sample_Preparation.MALDI_Matrix',
    placeholder: 'Search CHEBI (e.g. 2,5-dihydroxybenzoic acid)…',
  },
  {
    key: 'maldi_matrix_application',
    label: 'MALDI matrix application',
    group: 'acquisition',
    tier: 'recommended',
    editor: 'freeText',
    path: 'document.acquisition.maldi_matrix_application',
    appliesTo: 'all',
    requiredFor: 'none',
    legacyPath: 'Sample_Preparation.MALDI_Matrix_Application',
    valueSource: 'community',
    placeholder: 'Search or type (e.g. Spraying, Sublimation)…',
  },
  {
    key: 'solvent',
    label: 'Solvent',
    group: 'acquisition',
    tier: 'advanced',
    editor: 'ontology',
    path: 'document.acquisition.solvent',
    slot: 'solvent',
    appliesTo: 'all',
    requiredFor: 'none',
    legacyPath: 'Sample_Preparation.Solvent',
    placeholder: 'Search CHEBI (e.g. acetonitrile)…',
  },
]

export const LEGACY_LABELS: Record<string, string> = {
  'Sample_Information.Organism': 'Organism',
  'Sample_Information.Organism_Part': 'Organism part',
  'Sample_Information.Condition': 'Condition',
  'Sample_Information.Sample_Growth_Conditions': 'Sample growth conditions',
  'Sample_Preparation.Sample_Stabilisation': 'Sample stabilisation',
  'Sample_Preparation.Tissue_Modification': 'Tissue modification',
  'Sample_Preparation.MALDI_Matrix': 'MALDI matrix',
  'Sample_Preparation.MALDI_Matrix_Application': 'MALDI matrix application',
  'Sample_Preparation.Solvent': 'Solvent',
  'MS_Analysis.Polarity': 'Polarity',
  'MS_Analysis.Ionisation_Source': 'Ionisation source',
  'MS_Analysis.Analyzer': 'Analyzer',
  'MS_Analysis.Detector_Resolving_Power': 'Detector resolving power',
  'MS_Analysis.Pixel_Size': 'Pixel size',
  'Additional_Information.Supplementary': 'Supplementary',
}

export function fieldsFor(sampleType: SampleType): FieldDef[] {
  return FIELD_DEFS.filter((f) => f.appliesTo === 'all' || f.appliesTo.includes(sampleType))
}

export function requiredFor(sampleType: SampleType): FieldDef[] {
  return fieldsFor(sampleType).filter(
    (f) => f.requiredFor === 'all' || (f.requiredFor !== 'none' && f.requiredFor.includes(sampleType))
  )
}

export function fieldByKey(key: FieldKey): FieldDef {
  const def = FIELD_DEFS.find((f) => f.key === key)
  if (!def) {
    throw new Error(`Unknown v2 field ${key}`)
  }
  return def
}

export function fieldsByLegacyPath(legacyPath: string): FieldDef[] {
  return FIELD_DEFS.filter((f) => f.legacyPath === legacyPath)
}
