import { isPlaceholder } from './legacyLookups'
import { FieldKey, ValueResolver, ValueSuggestion } from './types'
import curatedValues from '../../../lib/metadataSchemas/curated_values.generated.json'

/** most suggestions a value-backed free-text field shows */
export const MAX_VALUE_SUGGESTIONS = 8

/**
 * Seed suggestions for the free-text fields that have no ontology. They come first in the list; values other
 * users entered (metadataSuggestions) fill the rest. Generated from graphql's metadataSchemas/curated_values.json
 * by the generate-curated-values script.
 */
export const CURATED_VALUES: Partial<Record<FieldKey, string[]>> = curatedValues

/** fields where "None" is a real answer (no modification, no matrix), so a community "None" is kept */
const NONE_IS_MEANINGFUL: FieldKey[] = ['tissue_modification', 'maldi_matrix_application']

export interface MergeOptions {
  /** keep community values equal to "none" (other placeholders such as "N/A" are always dropped) */
  keepNone?: boolean
}

/**
 * Curated values first, then community values: both filtered by case-insensitive substring of the query,
 * deduplicated case-insensitively (the curated spelling wins), placeholders dropped from the community values,
 * capped at MAX_VALUE_SUGGESTIONS.
 */
export function mergeValueSuggestions(
  curated: string[],
  community: string[],
  query: string,
  { keepNone = false }: MergeOptions = {}
): ValueSuggestion[] {
  const q = (query || '').trim().toLowerCase()
  const seen = new Set<string>()
  const out: ValueSuggestion[] = []
  const add = (raw: string) => {
    const label = (raw || '').trim()
    const key = label.toLowerCase()
    if (!label || seen.has(key) || !key.includes(q)) return
    seen.add(key)
    out.push({ label })
  }
  curated.forEach(add)
  community.filter((v) => !isPlaceholder(v) || (keepNone && (v || '').trim().toLowerCase() === 'none')).forEach(add)
  return out.slice(0, MAX_VALUE_SUGGESTIONS)
}

/** options for merging the given field's community values with its curated list */
export const mergeOptionsFor = (fieldKey: FieldKey): MergeOptions => ({
  keepNone: NONE_IS_MEANINGFUL.includes(fieldKey),
})

/** Curated values only; the default for forms created without a server-backed value resolver (and specs). */
export const curatedValueResolver: ValueResolver = async (fieldKey, query) =>
  mergeValueSuggestions(CURATED_VALUES[fieldKey] || [], [], query, mergeOptionsFor(fieldKey))
