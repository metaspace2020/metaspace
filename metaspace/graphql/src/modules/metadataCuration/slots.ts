import * as ontologySlots from '../../../metadataSchemas/ontology_slots.json'
// The curated slots, in queue order; shared with bin/copy-curated-values.js (plain JSON: that script runs from the
// webapp without graphql's TypeScript toolchain).
import * as curationCatalogue from '../../../metadataSchemas/curation_slots.json'
import { MetadataV2Document, OntologyTermValue } from '../dataset/projection'

const curationSlots: { slot: string, group: 'sample' | 'acquisition', reconciled?: boolean }[] =
  curationCatalogue.slots as { slot: string, group: 'sample' | 'acquisition', reconciled?: boolean }[]

export interface CurationSlot {
  slot: string
  group: 'sample' | 'acquisition'
  /** Key path under `document` to the OntologyTermValue. */
  path: string[]
  /** True when the slot is bound to an ontology in ontology_slots.json. */
  bound: boolean
}

export const CURATION_SLOTS: CurationSlot[] = curationSlots.map(({ slot, group, reconciled }) => ({
  slot,
  group,
  // a reconciled acquisition value (user_value + reconciliation_state) holds its term one level down
  path: reconciled ? [group, slot, 'user_value'] : [group, slot],
  bound: slot in ontologySlots,
}))

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
