import { projectToLegacyMetadata, upProjectToV2, LegacyMetadata } from './projection'

const fixtures: LegacyMetadata[] = [
  {
    Data_Type: 'Imaging MS',
    Sample_Information: {
      Organism: 'Mus musculus',
      Organism_Part: 'liver',
      Condition: 'wildtype',
      Sample_Growth_Conditions: 'standard housing, ad libitum feeding',
    },
    Sample_Preparation: {
      Sample_Stabilisation: 'fresh frozen',
      Tissue_Modification: 'none',
      MALDI_Matrix: 'DHB',
      MALDI_Matrix_Application: 'sublimation',
      Solvent: 'none',
    },
    MS_Analysis: {
      Polarity: 'Positive',
      Ionisation_Source: 'MALDI',
      Analyzer: 'Orbitrap',
      Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
      Pixel_Size: { Xaxis: 20, Yaxis: 20 },
    },
    Additional_Information: { Supplementary: 'internal batch ref 42' },
    Submitted_By: { Submitter: { Email: 'someone@example.org' } },
  },
  {
    Data_Type: 'Imaging MS',
    Sample_Information: {
      Organism: 'Homo sapiens',
      Organism_Part: 'melanoma',
      Condition: 'melanoma',
    },
    Sample_Preparation: {
      Sample_Stabilisation: 'FFPE',
      Tissue_Modification: 'none',
      MALDI_Matrix: 'none',
      MALDI_Matrix_Application: 'none',
      Solvent: 'none',
    },
    MS_Analysis: {
      Polarity: 'Negative',
      Ionisation_Source: 'DESI',
      Analyzer: 'timsTOF Pro',
      Detector_Resolving_Power: { mz: 200, Resolving_Power: 60000 },
      Pixel_Size: { Xaxis: 50, Yaxis: 50 },
    },
  },
]

const baseV2 = upProjectToV2(fixtures[0])

function withSample(overrides: Partial<typeof baseV2.document.sample>) {
  return {
    ...baseV2,
    document: { ...baseV2.document, sample: { ...baseV2.document.sample, ...overrides } },
  }
}

describe('projection round-trip', () => {
  it.each(fixtures.map((f, i) => [i, f] as const))('fixture %i: up-project then down-project reproduces the original', (_i, legacy) => {
    const v2 = upProjectToV2(legacy)
    const roundTripped = projectToLegacyMetadata(v2)
    expect(roundTripped).toEqual(legacy)
  })
})

describe('projectToLegacyMetadata: non-tissue sample sentinels', () => {
  it('CellCultureSample renders Organism_Part from cell_line_id, falling back to "cell culture"', () => {
    const cellCulture = withSample({
      sample_class: 'CellCultureSample',
      sample_type: 'cell_culture',
      cell_line_id: { value_label: 'HeLa', curation_state: 'controlled' },
    })
    expect(projectToLegacyMetadata(cellCulture).Sample_Information.Organism_Part).toBe('HeLa')

    const cellCultureNoLine = withSample({ sample_class: 'CellCultureSample', sample_type: 'cell_culture' })
    expect(projectToLegacyMetadata(cellCultureNoLine).Sample_Information.Organism_Part).toBe('cell culture')
  })

  it('PlantSample and EnvironmentalSample render fixed sentinels', () => {
    const plant = withSample({ sample_class: 'PlantSample', sample_type: 'plant' })
    expect(projectToLegacyMetadata(plant).Sample_Information.Organism_Part).toBe('plant')

    const environmental = withSample({ sample_class: 'EnvironmentalSample', sample_type: 'environmental' })
    expect(projectToLegacyMetadata(environmental).Sample_Information.Organism_Part).toBe('environmental')
  })

  it('non-tissue samples render "N/A" for the tissue-only stabilisation and modification slots', () => {
    const cellCulture = {
      ...baseV2,
      document: {
        ...baseV2.document,
        sample: {
          organism: baseV2.document.sample.organism,
          sample_class: 'CellCultureSample' as const,
          sample_type: 'cell_culture' as const,
        },
      },
    }
    const prep = projectToLegacyMetadata(cellCulture).Sample_Preparation
    expect(prep.Sample_Stabilisation).toBe('N/A')
    expect(prep.Tissue_Modification).toBe('N/A')

    // tissue keeps the empty string so the legacy validation still reports a missing value
    const tissue = withSample({ sample_stabilisation: undefined, tissue_modification: undefined })
    expect(projectToLegacyMetadata(tissue).Sample_Preparation.Sample_Stabilisation).toBe('')
    expect(projectToLegacyMetadata(tissue).Sample_Preparation.Tissue_Modification).toBe('')
  })
})

describe('projectToLegacyMetadata: polarity CURIE map', () => {
  it('maps MS:1000130 to Positive and MS:1000129 to Negative from the resolved CURIE, ignoring the label', () => {
    const positive = {
      ...baseV2,
      document: {
        ...baseV2.document,
        acquisition: {
          ...baseV2.document.acquisition,
          polarity: {
            user_value: { value_ontology_id: 'MS:1000130', value_label: 'positive scan', curation_state: 'controlled' as const },
            reconciliation_state: 'not_checked' as const,
          },
        },
      },
    }
    expect(projectToLegacyMetadata(positive).MS_Analysis.Polarity).toBe('Positive')

    const negative = {
      ...positive,
      document: {
        ...positive.document,
        acquisition: {
          ...positive.document.acquisition,
          polarity: {
            user_value: { value_ontology_id: 'MS:1000129', value_label: 'negative scan', curation_state: 'controlled' as const },
            reconciliation_state: 'not_checked' as const,
          },
        },
      },
    }
    expect(projectToLegacyMetadata(negative).MS_Analysis.Polarity).toBe('Negative')
  })
})

describe('projectToLegacyMetadata: Condition composition priority', () => {
  it('prefers a resolved disease label over health_status and genetic_background', () => {
    const v2 = withSample({
      disease: { value_label: 'Alzheimer disease', value_ontology_id: 'MONDO:0004975', curation_state: 'controlled' },
      health_status: 'disease_model',
      genetic_background: { value_free_text: '5xFAD', curation_state: 'pending_curation' },
    })
    expect(projectToLegacyMetadata(v2).Sample_Information.Condition).toBe('Alzheimer disease')
  })

  it('falls back to health_status when disease is unset and health_status is not "other"', () => {
    const v2 = withSample({ disease: undefined, health_status: 'control', genetic_background: undefined })
    expect(projectToLegacyMetadata(v2).Sample_Information.Condition).toBe('control')
  })

  it('falls back to genetic_background when disease is unset and health_status is "other"', () => {
    const v2 = withSample({
      disease: undefined,
      health_status: 'other',
      genetic_background: { value_free_text: 'APOE4 knock-in', curation_state: 'pending_curation' },
    })
    expect(projectToLegacyMetadata(v2).Sample_Information.Condition).toBe('APOE4 knock-in')
  })

  it('falls back to "unspecified" when nothing is set', () => {
    const v2 = withSample({ disease: undefined, health_status: undefined, genetic_background: undefined })
    expect(projectToLegacyMetadata(v2).Sample_Information.Condition).toBe('unspecified')
  })
})
