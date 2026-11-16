import { mergeLegacyIntoV2, projectLegacyField, projectToLegacyMetadata, upProjectToV2, LegacyMetadata, MetadataV2Envelope } from './projection'

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

describe('projectLegacyField', () => {
  const term = (label: string) => ({ value_label: label, curation_state: 'controlled' as const })
  const fullTissue: MetadataV2Envelope = {
    ...baseV2,
    document: {
      ...baseV2.document,
      sample: {
        ...baseV2.document.sample,
        genetic_background: term('C57BL/6'),
        anatomical_site_fine: term('hepatic lobule'),
        developmental_stage: term('adult'),
        cell_line_id: term('HeLa'),
      },
      acquisition: { ...baseV2.document.acquisition, solvent: term('methanol') },
    },
  }
  const cellCulture: MetadataV2Envelope = {
    ...fullTissue,
    document: {
      ...fullTissue.document,
      sample: {
        organism: fullTissue.document.sample.organism,
        sample_class: 'CellCultureSample',
        sample_type: 'cell_culture',
        health_status: 'other',
        genetic_background: term('KRAS G12D'),
        cell_line_id: term('HeLa'),
      },
      acquisition: { ...fullTissue.document.acquisition, maldi_matrix: undefined, solvent: undefined },
    },
  }
  const slots = ['organism', 'disease', 'anatomical_site_coarse', 'anatomical_site_fine', 'developmental_stage',
    'cell_line_id', 'ionization_source', 'maldi_matrix', 'solvent', 'sample_stabilisation', 'tissue_modification',
    'genetic_background', 'maldi_matrix_application']
  const nullSlots = ['anatomical_site_fine', 'developmental_stage']

  it.each([['tissue', fullTissue], ['cell culture', cellCulture]] as [string, MetadataV2Envelope][])(
    'agrees with projectToLegacyMetadata for every curated slot (%s)', (_name, envelope) => {
      const legacy = projectToLegacyMetadata(envelope) as any
      for (const slot of slots) {
        const field = projectLegacyField(envelope, slot)
        if (nullSlots.includes(slot)) {
          expect(field).toBeNull()
        } else {
          expect(field).not.toBeNull()
          expect(legacy[field!.path[0]][field!.path[1]]).toEqual(field!.value)
        }
      }
    })

  it('maps each slot to its legacy key', () => {
    const paths = Object.fromEntries(slots.map(slot => [slot, projectLegacyField(fullTissue, slot)?.path ?? null]))
    expect(paths).toEqual({
      organism: ['Sample_Information', 'Organism'],
      disease: ['Sample_Information', 'Condition'],
      anatomical_site_coarse: ['Sample_Information', 'Organism_Part'],
      anatomical_site_fine: null,
      developmental_stage: null,
      cell_line_id: ['Sample_Information', 'Organism_Part'],
      ionization_source: ['MS_Analysis', 'Ionisation_Source'],
      maldi_matrix: ['Sample_Preparation', 'MALDI_Matrix'],
      solvent: ['Sample_Preparation', 'Solvent'],
      sample_stabilisation: ['Sample_Preparation', 'Sample_Stabilisation'],
      tissue_modification: ['Sample_Preparation', 'Tissue_Modification'],
      genetic_background: ['Sample_Information', 'Condition'],
      maldi_matrix_application: ['Sample_Preparation', 'MALDI_Matrix_Application'],
    })
  })
})

describe('mergeLegacyIntoV2', () => {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const stored = clone(baseV2)
  stored.document.sample.disease = { value_ontology_id: 'MONDO:1', value_label: 'Melanoma', curation_state: 'controlled' }
  stored.document.sample.sample_stabilisation = {
    value_label: 'Fresh frozen', value_free_text: 'fresh frozen', curation_state: 'free_text_accepted',
  }
  const rendered = projectToLegacyMetadata(stored)

  it('keeps every slot whose legacy field is unchanged', () => {
    const merged = mergeLegacyIntoV2(stored, clone(rendered))

    expect(merged).toEqual(stored)
  })

  it('replaces only the slots whose legacy field changed, as pending values', () => {
    const legacy = clone(rendered)
    legacy.Sample_Information.Organism = 'Homo sapiens'
    legacy.MS_Analysis.Analyzer = 'timsTOF'
    legacy.MS_Analysis.Pixel_Size = { Xaxis: 5, Yaxis: 5 }

    const merged = mergeLegacyIntoV2(stored, legacy)

    expect(merged.document.sample.organism).toEqual({ value_free_text: 'Homo sapiens', curation_state: 'pending_curation' })
    expect(merged.document.acquisition.instrument_model).toEqual({
      user_value: { value_free_text: 'timsTOF', curation_state: 'pending_curation' },
      reconciliation_state: 'not_checked',
    })
    expect(merged.unmodeled.Pixel_Size).toEqual({ Xaxis: 5, Yaxis: 5 })
    expect(merged.document.sample.disease).toEqual(stored.document.sample.disease)
    expect(merged.document.sample.sample_stabilisation).toEqual(stored.document.sample.sample_stabilisation)
    expect(merged.document.sample.sample_class).toEqual(stored.document.sample.sample_class)
  })

  it('does not change the stored envelope', () => {
    const before = clone(stored)
    const legacy = clone(rendered)
    legacy.Sample_Information.Condition = 'wildtype'

    mergeLegacyIntoV2(stored, legacy)

    expect(stored).toEqual(before)
  })
})
