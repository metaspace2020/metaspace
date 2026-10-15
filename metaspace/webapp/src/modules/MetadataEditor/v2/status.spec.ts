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
    const s = computeStatus({ envelope: empty, fields: {}, unmapped: [], acknowledged: [], copied: [], dismissed: [] })
    expect(s.requiredTotal).toBe(10)
    expect(s.requiredFilled).toBe(2) // sample_type + resolving power defaults
    expect(s.status).toBe('partial')
    expect(s.missingRequired.map((f) => f.key)).toContain('organism')
    expect(isFieldFilled(empty, fieldByKey('pixel_size'))).toBe(false)
  })

  it('is complete when required filled, reviews acknowledged and unmapped handled', () => {
    const env = filled()
    const base = {
      envelope: env,
      fields: { organism: { state: 'review' as const }, solvent: { state: 'review' as const } },
      unmapped: [
        {
          legacyKey: 'Sample_Information.Condition',
          label: 'Condition',
          raw: 'wt',
          hint: '',
          targets: [],
          safeToDismiss: false,
        },
      ],
      acknowledged: [] as any[],
      copied: [] as string[],
      dismissed: [] as string[],
    }
    expect(computeStatus(base)).toMatchObject({
      requiredFilled: 10,
      reviewCount: 2,
      unmappedCount: 1,
      status: 'partial',
    })
    expect(
      computeStatus({ ...base, acknowledged: ['organism', 'solvent'], dismissed: ['Sample_Information.Condition'] })
    ).toMatchObject({
      reviewCount: 0,
      unmappedCount: 0,
      status: 'complete',
    })
    expect(
      computeStatus({ ...base, acknowledged: ['organism', 'solvent'], copied: ['Sample_Information.Condition'] })
        .unmappedCount
    ).toBe(0)
  })

  it('counts migrated fields for the banner bar', () => {
    const s = computeStatus({
      envelope: filled(),
      fields: {
        organism: { state: 'migrated' },
        polarity: { state: 'migrated' },
        disease: { state: 'new' },
        solvent: { state: 'copied' },
      },
      unmapped: [],
      acknowledged: [],
      copied: [],
      dismissed: [],
    })
    expect(s.migratedCount).toBe(2)
    expect(s.reviewCount).toBe(1) // copied counts as review until acknowledged
  })
})
