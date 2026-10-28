import { MetadataV2Document, OntologyTermValue } from '../dataset/projection'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ontologySlots: Record<string, unknown> = require('../../../metadataSchemas/ontology_slots.json')

export interface CurationSlot {
  slot: string
  group: 'sample' | 'acquisition'
  /** Key path under `document` to the OntologyTermValue. */
  path: string[]
  /** True when the slot is bound to an ontology in ontology_slots.json. */
  bound: boolean
}

const sampleSlot = (slot: string): CurationSlot => ({
  slot,
  group: 'sample',
  path: ['sample', slot],
  bound: slot in ontologySlots,
})

const acquisitionSlot = (slot: string, reconciled = false): CurationSlot => ({
  slot,
  group: 'acquisition',
  path: reconciled ? ['acquisition', slot, 'user_value'] : ['acquisition', slot],
  bound: slot in ontologySlots,
})

export const CURATION_SLOTS: CurationSlot[] = [
  sampleSlot('organism'),
  sampleSlot('disease'),
  sampleSlot('anatomical_site_coarse'),
  sampleSlot('anatomical_site_fine'),
  sampleSlot('developmental_stage'),
  sampleSlot('cell_line_id'),
  acquisitionSlot('ionization_source', true),
  acquisitionSlot('maldi_matrix'),
  acquisitionSlot('solvent'),
  sampleSlot('sample_stabilisation'),
  sampleSlot('tissue_modification'),
  sampleSlot('genetic_background'),
  acquisitionSlot('maldi_matrix_application'),
]

export function curationSlot(slot: string): CurationSlot | undefined {
  return CURATION_SLOTS.find(s => s.slot === slot)
}

export function getSlotValue(doc: MetadataV2Document, slot: CurationSlot): OntologyTermValue | null | undefined {
  let node: any = doc
  for (const key of slot.path) {
    node = node?.[key]
  }
  return node
}

export function setSlotValue(doc: MetadataV2Document, slot: CurationSlot, value: OntologyTermValue): void {
  const parent = slot.path.slice(0, -1).reduce<any>((node, key) => node[key], doc)
  parent[slot.path[slot.path.length - 1]] = value
}
