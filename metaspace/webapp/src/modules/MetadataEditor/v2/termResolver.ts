import {
  datasetCurationStatusQuery,
  fetchApprovedCurationValuesQuery,
  fetchAutocompleteSuggestionsQuery,
  fetchOntologyTermSuggestionsQuery,
} from '../../../api/metadata'
import { CURATED_VALUES, MAX_VALUE_SUGGESTIONS, mergeOptionsFor, mergeValueSuggestions } from './curatedValues'
import { fieldByKey } from './formDefinition'
import { CurationStatusLoader, Term, TermResolver, ValueResolver } from './types'

export const MIN_QUERY_LENGTH = 3

/** the slots whose accepted free-text terms are curated server-side (each slot name equals its field key) */
export const CURATED_SLOTS = [
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

interface ApolloLike {
  query: (opts: any) => Promise<any>
}

/** Apollo-backed resolver; the server ignores queries under 3 characters, so they are skipped here. */
export function createTermResolver(apolloClient: ApolloLike): TermResolver {
  return async (slot: string, query: string): Promise<Term[]> => {
    const trimmed = (query || '').trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return []
    }
    const resp = await apolloClient.query({
      query: fetchOntologyTermSuggestionsQuery,
      variables: { slot, query: trimmed },
    })
    return (resp.data?.ontologyTermSuggestions || []).map((t: any) => ({
      curie: t.curie,
      label: t.label,
      synonyms: t.synonyms || [],
    }))
  }
}

/**
 * Value suggestions: the field's curated seed list, the curator-approved terms of its slot (approvedCurationValues)
 * and the values other users entered for its legacy path (metadataSuggestions). A failed lookup is ignored.
 */
export function createValueResolver(apolloClient: ApolloLike): ValueResolver {
  return async (fieldKey, query) => {
    const def = fieldByKey(fieldKey)
    const trimmed = (query || '').trim()
    let community: string[] = []
    const communityField = def.communityPath || def.legacyPath
    if (def.valueSource === 'community' && communityField && trimmed) {
      try {
        const resp = await apolloClient.query({
          query: fetchAutocompleteSuggestionsQuery,
          variables: { field: communityField, query: trimmed, limit: MAX_VALUE_SUGGESTIONS },
        })
        community = resp.data?.metadataSuggestions || []
      } catch (err) {
        community = []
      }
    }
    let approved: string[] = []
    const slot = def.slot ?? def.key
    if (trimmed && CURATED_SLOTS.includes(slot)) {
      try {
        const resp = await apolloClient.query({
          query: fetchApprovedCurationValuesQuery,
          variables: { slot, query: trimmed },
        })
        approved = resp.data?.approvedCurationValues || []
      } catch (err) {
        approved = []
      }
    }
    return mergeValueSuggestions(
      CURATED_VALUES[fieldKey] || [],
      [...approved, ...community],
      trimmed,
      mergeOptionsFor(fieldKey)
    )
  }
}

/** Apollo-backed curation status of a dataset; network-only, since curators decide between two visits */
export function createCurationStatusLoader(apolloClient: ApolloLike): CurationStatusLoader {
  return async (datasetId) => {
    const resp = await apolloClient.query({
      query: datasetCurationStatusQuery,
      variables: { datasetId },
      fetchPolicy: 'network-only',
    })
    return (resp.data?.datasetCurationStatus || []).map((r: any) => ({
      slot: r.slot,
      text: r.text,
      status: r.status,
      note: r.note ?? null,
    }))
  }
}
