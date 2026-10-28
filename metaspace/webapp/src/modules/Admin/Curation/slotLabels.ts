import { fieldByKey } from '../../MetadataEditor/v2/formDefinition'
import { FieldKey } from '../../MetadataEditor/v2/types'

export interface SlotOption {
  slot: string
  label: string
  vocabulary: string
  bound: boolean
}

/**
 * Ontology prefix of the first root of each bound slot in graphql/metadataSchemas/ontology_slots.json. Hard-coded so
 * the graphql project's file is never bundled; slotLabels.spec.ts pins this table to the JSON.
 */
const ONTOLOGY_PREFIX: Record<string, string> = {
  organism: 'NCBITaxon',
  disease: 'MONDO',
  anatomical_site_coarse: 'UBERON',
  anatomical_site_fine: 'UBERON',
  developmental_stage: 'EFO',
  cell_line_id: 'CL',
  ionization_source: 'MS',
  maldi_matrix: 'CHEBI',
  solvent: 'CHEBI',
}

const UNBOUND = 'curated list'

/** the 13 slots the curation queue tracks, in the graphql CURATION_SLOTS order */
const CURATION_SLOTS: FieldKey[] = [
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
]

export const CURATION_SLOT_OPTIONS: SlotOption[] = CURATION_SLOTS.map((slot) => ({
  slot,
  label: fieldByKey(slot).label,
  vocabulary: ONTOLOGY_PREFIX[slot] ?? UNBOUND,
  bound: slot in ONTOLOGY_PREFIX,
}))

/** the option for a slot; an unknown slot falls back to its key as label and an unbound vocabulary */
export function slotOption(slot: string): SlotOption {
  return CURATION_SLOT_OPTIONS.find((o) => o.slot === slot) ?? { slot, label: slot, vocabulary: UNBOUND, bound: false }
}
