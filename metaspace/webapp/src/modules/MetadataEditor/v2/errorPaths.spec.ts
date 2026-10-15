import { mapServerErrors } from './errorPaths'

describe('mapServerErrors', () => {
  it('maps legacy-shaped and v2-shaped paths to fields', () => {
    const { fieldErrors, otherErrors } = mapServerErrors([
      { dataPath: '.Sample_Information.Organism', message: 'should NOT be shorter than 3 characters' },
      { dataPath: '.MS_Analysis.Detector_Resolving_Power.mz', message: 'should be >= 50' },
      {
        dataPath: '.metadataV2.document.sample.organism.curation_state',
        message: 'must be equal to one of the allowed values',
      },
      { dataPath: '.metadataV2.document.acquisition.instrument_model.user_value', message: 'must be object' },
      { dataPath: '.metadataV2.document.acquisition.polarity.user_value.value_label', message: 'must be string' },
      { dataPath: '.metadataV2', message: 'metadataV2Json is not valid JSON' },
      { dataPath: '.Sample_Information.Condition', message: 'should NOT be shorter than 3 characters' },
    ])
    expect(fieldErrors.organism).toBe('should NOT be shorter than 3 characters')
    expect(fieldErrors.resolving_power).toBe('should be >= 50')
    expect(fieldErrors.instrument_model).toBe('must be object')
    expect(fieldErrors.polarity).toBe('must be string')
    expect(otherErrors).toEqual([
      '.metadataV2: metadataV2Json is not valid JSON',
      '.Sample_Information.Condition: should NOT be shorter than 3 characters',
    ])
  })

  it('keeps the first message per field', () => {
    const { fieldErrors } = mapServerErrors([
      { dataPath: '.Sample_Information.Organism', message: 'first' },
      { dataPath: '.metadataV2.document.sample.organism', message: 'second' },
    ])
    expect(fieldErrors.organism).toBe('first')
  })
})
