import { fetchAutocompleteSuggestionsQuery, fetchOntologyTermSuggestionsQuery } from '../../../api/metadata'
import { CURATED_VALUES, MAX_VALUE_SUGGESTIONS, mergeOptionsFor, mergeValueSuggestions } from './curatedValues'
import { fieldByKey } from './formDefinition'
import { Term, TermResolver, ValueResolver } from './types'

export const MIN_QUERY_LENGTH = 3

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
 * Suggestions for the free-text fields without ontology: the field's curated seed list plus the values other
 * users entered for its legacy path (metadataSuggestions). A failed lookup falls back to the curated list.
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
    return mergeValueSuggestions(CURATED_VALUES[fieldKey] || [], community, trimmed, mergeOptionsFor(fieldKey))
  }
}
