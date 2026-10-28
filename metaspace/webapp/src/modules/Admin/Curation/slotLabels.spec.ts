import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CURATION_SLOT_OPTIONS, slotOption } from './slotLabels'

// ontology_slots.json lives in the graphql project and must never be bundled into the webapp, so it is read with fs
// here only; this test pins the hard-coded prefix table in slotLabels.ts to it.
const slotsPath = resolve(__dirname, '../../../../../graphql/metadataSchemas/ontology_slots.json')
const ontologySlots: Record<string, { root: string }[]> = JSON.parse(readFileSync(slotsPath, 'utf8'))

describe('slotLabels', () => {
  it('lists the 13 curated slots', () => {
    expect(CURATION_SLOT_OPTIONS).toHaveLength(13)
    expect(new Set(CURATION_SLOT_OPTIONS.map((o) => o.slot)).size).toBe(13)
  })

  it('labels a bound slot with the form label and its ontology prefix', () => {
    expect(slotOption('disease')).toEqual({ slot: 'disease', label: 'Disease', vocabulary: 'MONDO', bound: true })
  })

  it('marks an unbound slot as a curated list', () => {
    expect(slotOption('sample_stabilisation')).toEqual({
      slot: 'sample_stabilisation',
      label: 'Sample stabilisation',
      vocabulary: 'curated list',
      bound: false,
    })
  })

  it('matches every bound slot to the prefix of its first root in ontology_slots.json', () => {
    for (const option of CURATION_SLOT_OPTIONS) {
      const roots = ontologySlots[option.slot]
      expect(option.bound, option.slot).toBe(roots !== undefined)
      if (roots) {
        expect(option.vocabulary, option.slot).toBe(roots[0].root.split(':')[0])
      } else {
        expect(option.vocabulary, option.slot).toBe('curated list')
      }
    }
  })
})
