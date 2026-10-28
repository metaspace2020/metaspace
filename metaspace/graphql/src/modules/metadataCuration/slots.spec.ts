import { CURATION_SLOTS, curationSlot, getSlotValue, setSlotValue } from './slots'
import { MetadataV2Document } from '../dataset/projection'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ontologySlots: Record<string, unknown> = require('../../../metadataSchemas/ontology_slots.json')

const emptyTerm = { curation_state: 'pending_curation' as const }

const makeDoc = (): MetadataV2Document => ({
  schema_version: '2',
  data_type: 'Imaging MS',
  sample: { organism: emptyTerm, disease: null },
  acquisition: {
    polarity: { user_value: emptyTerm, reconciliation_state: 'user_only' },
    ionization_source: {
      user_value: { curation_state: 'pending_curation', value_free_text: 'MALDI' },
      reconciliation_state: 'user_only',
    },
    instrument_model: { user_value: emptyTerm, reconciliation_state: 'user_only' },
  },
} as unknown as MetadataV2Document)

describe('modules/metadataCuration/slots', () => {
  it('lists the 13 curated slots in order', () => {
    expect(CURATION_SLOTS.map(s => s.slot)).toEqual([
      'organism',
      'disease',
      'anatomical_site_coarse',
      'anatomical_site_fine',
      'developmental_stage',
      'cell_line_id',
      'ionization_source',
      'maldi_matrix',
      'solvent',
      'sample_stabilisation',
      'tissue_modification',
      'genetic_background',
      'maldi_matrix_application',
    ])
  })

  it('does not curate instrument_model', () => {
    expect(curationSlot('instrument_model')).toBeUndefined()
  })

  it('reads a reconciled acquisition value through user_value', () => {
    const slot = curationSlot('ionization_source')!
    expect(slot.path).toEqual(['acquisition', 'ionization_source', 'user_value'])
    expect(getSlotValue(makeDoc(), slot)).toEqual({ curation_state: 'pending_curation', value_free_text: 'MALDI' })
  })

  it('returns undefined for an absent slot', () => {
    expect(getSlotValue(makeDoc(), curationSlot('solvent')!)).toBeUndefined()
  })

  it('writes a sample slot value', () => {
    const doc = makeDoc()
    const value = { curation_state: 'free_text_accepted' as const, value_free_text: 'melanoma' }
    setSlotValue(doc, curationSlot('disease')!, value)
    expect(doc.sample.disease).toEqual(value)
  })

  it('flags bound slots', () => {
    expect(curationSlot('disease')!.bound).toBe(true)
    expect(curationSlot('sample_stabilisation')!.bound).toBe(false)
  })

  it('only marks slots bound that are keys of ontology_slots.json', () => {
    CURATION_SLOTS.filter(s => s.bound).forEach(s => {
      expect(Object.keys(ontologySlots)).toContain(s.slot)
    })
  })
})
