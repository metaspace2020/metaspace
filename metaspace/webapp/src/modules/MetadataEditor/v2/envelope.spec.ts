import {
  appendProtocol,
  createEmptyEnvelope,
  emptyTermValue,
  getAtPath,
  isTermEmpty,
  POLARITY_TERMS,
  polarityOf,
  setAtPath,
  termText,
} from './envelope'

describe('envelope', () => {
  it('creates a tissue envelope with pending_curation seeds and no extra keys', () => {
    const env = createEmptyEnvelope()
    expect(env.document.schema_version).toBe('0.2.0')
    expect(env.document.data_type).toBe('Imaging MS')
    expect(env.document.sample.sample_type).toBe('tissue')
    expect(env.document.sample.sample_class).toBe('TissueSample')
    expect(env.document.sample.organism).toEqual({ curation_state: 'pending_curation' })
    expect(env.document.acquisition.polarity).toEqual({
      user_value: { curation_state: 'pending_curation' },
      reconciliation_state: 'not_checked',
    })
    expect(env.unmodeled).toEqual({
      Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
      Pixel_Size: { Xaxis: null, Yaxis: null },
    })
    expect(Object.keys(env.document.sample)).not.toContain('cell_line_id')
  })

  it('creates a cell culture envelope without tissue-only slots', () => {
    const env = createEmptyEnvelope('cell_culture')
    expect(env.document.sample.sample_class).toBe('CellCultureSample')
    expect(env.document.sample.cell_line_id).toEqual({ curation_state: 'pending_curation' })
    expect(Object.keys(env.document.sample)).not.toContain('sample_stabilisation')
  })

  it('gets and sets by path without mutating the input', () => {
    const env = createEmptyEnvelope()
    const next = setAtPath(env, 'document.sample.organism', {
      value_free_text: 'mouse',
      curation_state: 'pending_curation',
    })
    expect(getAtPath(next, 'document.sample.organism')).toEqual({
      value_free_text: 'mouse',
      curation_state: 'pending_curation',
    })
    expect(getAtPath(env, 'document.sample.organism')).toEqual(emptyTermValue())
  })

  it('knows when a term value is empty', () => {
    expect(isTermEmpty(undefined)).toBe(true)
    expect(isTermEmpty({ curation_state: 'pending_curation' })).toBe(true)
    expect(isTermEmpty({ curation_state: 'pending_curation', value_free_text: '  ' })).toBe(true)
    expect(isTermEmpty({ curation_state: 'controlled', value_ontology_id: 'X:1', value_label: 'x' })).toBe(false)
    expect(termText({ curation_state: 'controlled', value_ontology_id: 'X:1', value_label: 'x' })).toBe('x')
    expect(termText({ curation_state: 'pending_curation', value_free_text: 'free' })).toBe('free')
  })

  it('appends protocol lines with a separator and reads polarity', () => {
    let env = createEmptyEnvelope()
    env = appendProtocol(env, 'Solvent: 70% ACN.')
    env = appendProtocol(env, 'Matrix application device: TM-Sprayer.')
    expect(env.document.sample.protocol_description).toBe('Solvent: 70% ACN. Matrix application device: TM-Sprayer.')
    expect(polarityOf(env)).toBeNull()
    env = setAtPath(env, 'document.acquisition.polarity.user_value', POLARITY_TERMS.Negative)
    expect(polarityOf(env)).toBe('Negative')
  })
})
