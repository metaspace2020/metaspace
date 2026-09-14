import { validateMetadata } from './Mutation'

// Deliberately does NOT import graphqlTestEnvironment/testDataCreation - validateMetadata is a pure
// function (no DB, no GraphQL context), and this file exists specifically to verify the Ajv 4->8
// migration's error shape without requiring a live database.

const baseIms = {
  Data_Type: 'Imaging MS',
  Sample_Information: { Organism: 'Mus musculus', Organism_Part: 'liver', Condition: 'wildtype' },
  Sample_Preparation: {
    Sample_Stabilisation: 'fresh frozen',
    Tissue_Modification: 'none',
    MALDI_Matrix: 'DHB',
    MALDI_Matrix_Application: 'sublimation',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 20, Yaxis: 20 },
  },
}

function getValidationErrors(metadata: any): any[] {
  try {
    validateMetadata(metadata)
    return []
  } catch (err: any) {
    return JSON.parse(err.message).validation_errors
  }
}

describe('validateMetadata (Ajv 4 -> 8 migration)', () => {
  it('accepts a fully valid Imaging MS payload with no errors', () => {
    expect(getValidationErrors(baseIms)).toEqual([])
  })

  it('reports dot-path dataPath (legacy shape), not JSON-Pointer instancePath, for a nested field', () => {
    const invalid = { ...baseIms, Sample_Information: { ...baseIms.Sample_Information, Organism: '' } }
    const errors = getValidationErrors(invalid)
    const organismError = errors.find((e) => e.keyword === 'minLength')
    expect(organismError.dataPath).toBe('.Sample_Information.Organism')
    expect(organismError.instancePath).toBeUndefined()
  })

  it('reports a top-level-object dataPath correctly for a missing required property', () => {
    const invalid = {
      ...baseIms,
      Sample_Preparation: { MALDI_Matrix: 'DHB', MALDI_Matrix_Application: 'sublimation' },
    }
    const errors = getValidationErrors(invalid)
    const missingStabilisation = errors.find((e) => e.params?.missingProperty === 'Sample_Stabilisation')
    expect(missingStabilisation.dataPath).toBe('.Sample_Preparation')
  })

  it('still flags an unrecognized analyzer with the hand-constructed legacy error shape', () => {
    const invalid = { ...baseIms, MS_Analysis: { ...baseIms.MS_Analysis, Analyzer: 'a totally novel gadget' } }
    const errors = getValidationErrors(invalid)
    expect(errors).toContainEqual({
      dataPath: '.MS_Analysis.Analyzer',
      message: 'Unrecognized analyzer. Please specify the technology: FT-ICR, Orbitrap or TOF.',
    })
  })

  it('accepts custom UI-hint keywords (help, smEditorType, ...) in the schema without throwing', () => {
    // Regression guard for Ajv 8's default strict-mode rejecting unknown keywords - if `strict: false`
    // is ever dropped from the Ajv04 instantiation, compiling ims.json throws before this call returns.
    expect(() => validateMetadata(baseIms)).not.toThrow()
  })
})
