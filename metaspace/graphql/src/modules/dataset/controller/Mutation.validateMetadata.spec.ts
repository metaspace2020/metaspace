import { parseMetadataV2Envelope, processingSettingsChanged, resolveMetadataInput, validateMetadata } from './Mutation'
import { LegacyMetadata, upProjectToV2 } from '../projection'

// Deliberately does NOT import graphqlTestEnvironment/testDataCreation - validateMetadata is a pure
// function (no DB, no GraphQL context), and this file exists specifically to verify the Ajv 4->8
// migration's error shape without requiring a live database.

const baseIms: LegacyMetadata = {
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
  } catch (err) {
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

const getFailedValidation = (fn: () => any): any[] => {
  try {
    fn()
  } catch (err) {
    const parsed = JSON.parse(err.message)
    expect(parsed.type).toBe('failed_validation')
    return parsed.validation_errors
  }
  throw new Error('expected failed_validation')
}

describe('metadata_v2 input handling', () => {
  const validV2 = upProjectToV2(baseIms)

  it.each([
    ['not JSON', 'nope'],
    ['empty object', '{}'],
    ['document without sample/acquisition', JSON.stringify({ document: {}, unmodeled: {} })],
    ['missing unmodeled', JSON.stringify({ document: validV2.document })],
    ['acquisition without user_value objects', JSON.stringify({
      document: { ...validV2.document, acquisition: { polarity: {}, ionization_source: {}, instrument_model: {} } },
      unmodeled: {},
    })],
  ])('rejects a malformed envelope (%s) with a validation error instead of crashing', (_name, json) => {
    const errors = getFailedValidation(() => parseMetadataV2Envelope(json))
    expect(errors).toHaveLength(1)
    expect(errors[0].dataPath).toBe('.metadataV2')
  })

  it('derives the legacy metadata from metadataV2Json and ignores metadataJson when both are given', () => {
    const { metadata, metadataV2 } = resolveMetadataInput('{"Data_Type":"garbage"}', JSON.stringify(validV2))
    expect(metadata).toMatchObject(baseIms)
    expect(metadataV2).toEqual(validV2)
    expect(() => validateMetadata(metadata, metadataV2)).not.toThrow()
  })

  it('up-projects a metadata_v2 document when only metadataJson is given, so every dataset gets a v2 record', () => {
    const resolved = resolveMetadataInput(JSON.stringify(baseIms), null)
    expect(resolved.metadata).toEqual(baseIms)
    expect(resolved.metadataV2).toEqual(upProjectToV2(baseIms))
    expect(() => validateMetadata(resolved.metadata, resolved.metadataV2)).not.toThrow()
    expect(resolveMetadataInput(null, null)).toEqual({ metadata: undefined, metadataV2: undefined })
  })

  it('projects a controlled polarity given only by label, and leaves an unresolved one to validation', () => {
    const withPolarity = (user_value: any) => ({
      ...validV2,
      document: {
        ...validV2.document,
        acquisition: { ...validV2.document.acquisition, polarity: { user_value, reconciliation_state: 'not_checked' } },
      },
    })
    const byLabel = resolveMetadataInput(null, JSON.stringify(withPolarity({ value_label: 'Negative', curation_state: 'controlled' })))
    expect(byLabel.metadata.MS_Analysis.Polarity).toBe('Negative')
    const unresolved = resolveMetadataInput(null, JSON.stringify(withPolarity({ value_free_text: '??', curation_state: 'pending_curation' })))
    expect(unresolved.metadata.MS_Analysis.Polarity).toBeUndefined()
    const errors = getFailedValidation(() => validateMetadata(unresolved.metadata, unresolved.metadataV2))
    expect(errors.some((e) => e.params?.missingProperty === 'Polarity')).toBe(true)
  })

  it('does not invent Detector_Resolving_Power when unmodeled omits it', () => {
    const { metadata, metadataV2 } = resolveMetadataInput(null, JSON.stringify({ ...validV2, unmodeled: {} }))
    expect(metadata.MS_Analysis.Detector_Resolving_Power).toBeUndefined()
    const errors = getFailedValidation(() => validateMetadata(metadata, metadataV2))
    expect(errors.some((e) => e.params?.missingProperty === 'Detector_Resolving_Power')).toBe(true)
  })

  it('reports schema errors in the v2 document under .metadataV2.document', () => {
    const invalid = {
      ...validV2,
      document: { ...validV2.document, sample: { ...validV2.document.sample, organism: undefined } },
    }
    const errors = getFailedValidation(() => validateMetadata(baseIms, invalid as any))
    expect(errors.some((e) => e.dataPath.startsWith('.metadataV2.document') && e.params?.missingProperty === 'organism'))
      .toBe(true)
  })
})

describe('processingSettingsChanged: analyzer class', () => {
  const ds = { metadata: baseIms } as any
  const withAnalyzer = (Analyzer: string) => ({
    ...baseIms, MS_Analysis: { ...baseIms.MS_Analysis, Analyzer },
  })

  it('flags a reprocess when the analyzer class changes', () => {
    const { procSettingsUpd } = processingSettingsChanged(ds, { metadata: withAnalyzer('timsTOF Pro') } as any)
    expect(procSettingsUpd).toBe(true)
  })

  it('does not flag a relabel within the same class', () => {
    const { procSettingsUpd } = processingSettingsChanged(ds, { metadata: withAnalyzer('Q Exactive HF') } as any)
    expect(procSettingsUpd).toBe(false)
  })
})
