/* eslint-disable camelcase */
import { createEmptyEnvelope, POLARITY_TERMS, setAtPath } from './envelope'
import { computeStatus, isFieldFilled } from './status'
import { fieldByKey } from './formDefinition'

const filled = () => {
  let env = createEmptyEnvelope()
  const term = { value_ontology_id: 'X:1', value_label: 'x', curation_state: 'controlled' as const }
  env = setAtPath(env, 'document.sample.organism', term)
  env = setAtPath(env, 'document.sample.anatomical_site_coarse', term)
  env = setAtPath(env, 'document.sample.sample_stabilisation', term)
  env = setAtPath(env, 'document.sample.tissue_modification', term)
  env = setAtPath(env, 'document.acquisition.polarity.user_value', POLARITY_TERMS.Positive)
  env = setAtPath(env, 'document.acquisition.ionization_source.user_value', term)
  env = setAtPath(env, 'document.acquisition.instrument_model.user_value', term)
  env = setAtPath(env, 'unmodeled.Pixel_Size', { Xaxis: 10, Yaxis: 10 })
  return env
}

describe('status', () => {
  it('counts required fields for the sample type', () => {
    const empty = createEmptyEnvelope()
    const s = computeStatus({ envelope: empty, fields: {} })
    expect(s.requiredTotal).toBe(10)
    expect(s.requiredFilled).toBe(2) // sample_type + resolving power defaults
    expect(s.missingRequired.map((f) => f.key)).toContain('organism')
    expect(isFieldFilled(empty, fieldByKey('pixel_size'))).toBe(false)
  })

  it('has no missing required field when every required field is filled', () => {
    expect(computeStatus({ envelope: filled(), fields: {} })).toMatchObject({ requiredFilled: 10, missingRequired: [] })
  })

  it('counts migrated fields for the banner', () => {
    const s = computeStatus({
      envelope: filled(),
      fields: {
        organism: { state: 'migrated' },
        polarity: { state: 'migrated' },
        disease: { state: 'new' },
      },
    })
    expect(s.migratedCount).toBe(2)
  })
})
