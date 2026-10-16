import { FieldResolversFor } from '../../bindingTypes'
import { Query } from '../../binding'
import { esFilterValueCountResults } from '../../../esConnector'
import config from '../../utils/config'
import { Context, ContextUser } from '../../context'
import { IResolvers } from 'graphql-tools'
import * as _ from 'lodash'
import { ScoringModel } from '../engine/model'

// LinkML slot -> ontology root CURIE(s) its suggestions are scoped to. graphql owns this file; the
// engine's import script reads a generated copy (`yarn gen-ontology-slots`, checked by CI), so the
// suggestion scope and the imported subtrees cannot drift.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ontologySlots: Record<string, { root: string }[]> = require('../../../metadataSchemas/ontology_slots.json')
const SLOT_SUBTREES: Record<string, string[]> = _.mapValues(ontologySlots, bindings => bindings.map(b => b.root))

const MAX_ONTOLOGY_SUGGESTIONS = 50
const MIN_ONTOLOGY_QUERY_LENGTH = 3
const ONTOLOGY_CANDIDATE_LIMIT = 1000
const ONTOLOGY_FUZZY_TIMEOUT_MS = 1500
// The similarity stage can burn a Postgres core for up to ONTOLOGY_FUZZY_TIMEOUT_MS per query, so
// at most this many run at once; beyond that a typo just gets no suggestions until the user types on.
const ONTOLOGY_FUZZY_MAX_IN_FLIGHT = 3
let fuzzyInFlight = 0

// Rank of a candidate term against the query, lower is better: 1 exact label, 2 exact synonym, 3 label prefix,
// 4 any other match. `queryParam` holds the lower-cased query, `prefixParam` the escaped LIKE prefix pattern.
const ontologyMatchRank = (queryParam: string, prefixParam: string) => `CASE
          WHEN lower(label) = ${queryParam} THEN 1
          WHEN EXISTS (SELECT 1 FROM unnest(synonyms) AS synonym WHERE lower(synonym) = ${queryParam}) THEN 2
          WHEN lower(label) LIKE ${prefixParam} THEN 3
          ELSE 4
        END`

// Merges ranked rows keeping the better-ranked copy of a term found twice, sorted by rank, then shortest label.
const mergeRankedSuggestions = (current: any[], extra: any[], rowLimit: number): any[] => {
  const byCurie = new Map<string, any>()
  for (const row of [...current, ...extra]) {
    const seen = byCurie.get(row.curie)
    if (seen === undefined || row.rank < seen.rank) {
      byCurie.set(row.curie, row)
    }
  }
  return Array.from(byCurie.values())
    .sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label))
    .slice(0, rowLimit)
}

/** Drops the internal `rank` column so cached and returned rows carry only OntologyTerm fields. */
const withoutRank = (row: any) => _.omit(row, 'rank')

// Suggestions only change when the term table is re-imported (an admin script, run rarely), and short
// queries repeat across users, so each distinct (slot, query, limit) is computed once per TTL. A very
// common token like "meth" matches 100k CHEBI rows and costs ~0.5 s uncached; cached it costs nothing.
const ONTOLOGY_CACHE_TTL_MS = 10 * 60 * 1000
const ONTOLOGY_CACHE_MAX_ENTRIES = 5000
const ontologySuggestionCache = new Map<string, { expires: number, rows: any[] }>()

export const clearOntologyTermSuggestionCache = () => ontologySuggestionCache.clear()

// `compute` may return `{ rows, cacheable: false }` for a result that must not be remembered.
type SuggestionResult = any[] | { rows: any[], cacheable: boolean }

const cachedOntologySuggestions = async(key: string, compute: () => Promise<SuggestionResult>) => {
  const hit = ontologySuggestionCache.get(key)
  if (hit && hit.expires > Date.now()) {
    return hit.rows
  }
  const result = await compute()
  const { rows, cacheable } = Array.isArray(result) ? { rows: result, cacheable: true } : result
  if (cacheable) {
    if (ontologySuggestionCache.size >= ONTOLOGY_CACHE_MAX_ENTRIES) {
      const oldestKey = ontologySuggestionCache.keys().next().value // oldest insertion
      if (oldestKey !== undefined) {
        ontologySuggestionCache.delete(oldestKey)
      }
    }
    ontologySuggestionCache.set(key, { expires: Date.now() + ONTOLOGY_CACHE_TTL_MS, rows })
  }
  return rows
}

const getTopFieldValues = async(docType: 'dataset' | 'annotation',
  field: string,
  query: string | null | undefined,
  limit: number | undefined,
  user: ContextUser): Promise<string[]> => {
  const itemCounts = await esFilterValueCountResults({
    aggsTerms: {
      terms: {
        field: `${field}.raw`,
        size: limit,
        order: { _count: 'desc' },
      },
    },
    filters: [
      { wildcard: { [field]: query ? `*${query}*` : '*' } },
    ],
    docType,
    user,
  })

  return Object.entries(itemCounts as { [key: string]: number })
    .filter(([key]) => key !== '')
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key)
}

const padPlusMinus = (s: string) => s.replace(/([+-])/g, ' $1 ')

const QueryResolvers: FieldResolversFor<Query, void> = {
  async metadataSuggestions(source, { field, query, limit }, ctx) {
    return await getTopFieldValues('dataset', `ds_meta.${field}`, query, limit, ctx.user)
  },

  async chemModSuggestions(source, { query }, ctx) {
    const itemCounts = await getTopFieldValues('annotation', 'chem_mod', query, 10, ctx.user)

    return itemCounts.map(chemMod => ({
      chemMod,
      name: `[M${padPlusMinus(chemMod)}]`,
    }))
  },

  async neutralLossSuggestions(source, { query }, ctx) {
    const itemCounts = await getTopFieldValues('annotation', 'neutral_loss', query, 10, ctx.user)

    return itemCounts.map(neutralLoss => ({
      neutralLoss,
      name: `[M${padPlusMinus(neutralLoss)}]`,
    }))
  },

  adductSuggestions() {
    return config.adducts
  },

  async submitterSuggestions(source, { query }, ctx) {
    const itemCounts = await esFilterValueCountResults({
      aggsTerms: {
        terms: {
          script: {
            inline: "doc['ds_submitter_id'].value + '/' + doc['ds_submitter_name.raw'].value",
            lang: 'painless',
          },
          size: 1000,
          order: { _key: 'asc' },
        },
      },
      filters: [{ wildcard: { ds_submitter_name: `*${query}*` } }],
      docType: 'dataset',
      user: ctx.user,
    })
    return Object.keys(itemCounts).map((s) => {
      const [id, name] = s.split('/')
      return { id, name }
    })
  },

  colocalizationAlgos() {
    return config.metadataLookups.colocalizationAlgos
      .map(([id, name]) => ({ id, name }))
  },

  async scoringModels(source, args, ctx: Context) {
    return await ctx.entityManager.find(ScoringModel)
  },

  async ontologyTermSuggestions(source, { slot, query, limit }, ctx: Context) {
    const subtrees = SLOT_SUBTREES[slot]
    const trimmedQuery = (query || '').trim()
    // Unknown or free-text-only slot: the webapp always accepts free text anyway. Short queries
    // (the webapp fires one on focus) would rank the whole subtree, millions of rows for organism.
    if (!subtrees || trimmedQuery.length < MIN_ONTOLOGY_QUERY_LENGTH) {
      return []
    }
    // Escape ILIKE metacharacters so a literal '%' or '_' can't match the whole subtree.
    const escaped = trimmedQuery.replace(/[\\%_]/g, '\\$&')
    const rowLimit = Math.min(Math.max(limit || 10, 1), MAX_ONTOLOGY_SUGGESTIONS)
    // Stage 1: label prefixes via the btree on lower(label), cheap at any table size. If no exact label
    // came back, a probe finds exact synonyms (e.g. "hippocampus" on hippocampal formation), which a page
    // of prefix matches would otherwise hide. Stage 2, only while the limit is unfilled: label or synonym
    // substrings. Probe and stage 2 use the trigram GIN indexes. Every query sorts at most
    // ONTOLOGY_CANDIDATE_LIMIT rows ("sp." matches 1.4M NCBITaxon rows; sorting them all costs seconds).
    const lowerQuery = trimmedQuery.toLowerCase()
    const prefixPattern = `${escaped.toLowerCase()}%`
    const substringPattern = `%${escaped}%`
    return await cachedOntologySuggestions(`${slot}\0${lowerQuery}\0${rowLimit}`, async() => {
      const prefixRows: any[] = await ctx.entityManager.query(`
        SELECT curie, label, synonyms, ontology, subtree, obsolete, ${ontologyMatchRank('$4', '$2')} AS rank FROM (
          SELECT curie, label, synonyms, ontology, subtree, obsolete
          FROM public.ontology_term
          WHERE subtree = ANY($1) AND obsolete = false AND lower(label) LIKE $2
          LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
        ) candidates
        ORDER BY rank ASC, length(label) ASC, label ASC
        LIMIT $3`,
      [subtrees, prefixPattern, rowLimit, lowerQuery])
      let rows = prefixRows
      if (!prefixRows.some(row => row.rank === 1)) {
        const exactSynonymRows: any[] = await ctx.entityManager.query(`
          SELECT curie, label, synonyms, ontology, subtree, obsolete, 2 AS rank FROM (
            SELECT curie, label, synonyms, ontology, subtree, obsolete
            FROM public.ontology_term
            WHERE subtree = ANY($1) AND obsolete = false AND ontology_term_synonym_text(synonyms) ILIKE $2
            LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
          ) candidates
          WHERE EXISTS (SELECT 1 FROM unnest(synonyms) AS synonym WHERE lower(synonym) = $3)
          ORDER BY length(label) ASC, label ASC
          LIMIT $4`,
        [subtrees, substringPattern, lowerQuery, rowLimit])
        rows = mergeRankedSuggestions(rows, exactSynonymRows, rowLimit)
      }
      if (rows.length >= rowLimit) {
        return rows.map(withoutRank)
      }
      // The rank's prefix branch never fires here: the WHERE excludes label prefixes.
      const substringRows: any[] = await ctx.entityManager.query(`
        SELECT curie, label, synonyms, ontology, subtree, obsolete, ${ontologyMatchRank('$5', '$2')} AS rank FROM (
          SELECT curie, label, synonyms, ontology, subtree, obsolete
          FROM public.ontology_term
          WHERE subtree = ANY($1) AND obsolete = false
            AND NOT (lower(label) LIKE $2)
            AND (label ILIKE $3 OR ontology_term_synonym_text(synonyms) ILIKE $3)
          LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
        ) candidates
        ORDER BY rank ASC, length(label) ASC, label ASC
        LIMIT $4`,
      [subtrees, prefixPattern, substringPattern, rowLimit, lowerQuery])
      rows = mergeRankedSuggestions(rows, substringRows, rowLimit)
      if (rows.length > 0) {
        return rows.map(withoutRank)
      }
      // Stage 3, typos: nothing contains the text, so fall back to trigram similarity (`%` uses
      // pg_trgm.similarity_threshold, 0.3 by default) - "melanona" -> melanoma. Useful typos cost
      // 40 ms to 1.4 s cold on the organism slot; junk made of common trigrams ("sp. str bact") would
      // cost 5 s, so the statement is capped and a timeout simply yields no suggestions.
      if (fuzzyInFlight >= ONTOLOGY_FUZZY_MAX_IN_FLIGHT) {
        return { rows: [], cacheable: false }
      }
      fuzzyInFlight++
      // Run on a raw pg client rather than through TypeORM: a timeout here is an expected outcome,
      // and TypeORM would log every one at error level with a stack trace before we could catch it.
      const [client, release] = await (ctx.entityManager.connection.driver as any).obtainMasterConnection()
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL statement_timeout = ${ONTOLOGY_FUZZY_TIMEOUT_MS}`)
        const { rows } = await client.query(`
          SELECT curie, label, synonyms, ontology, subtree, obsolete FROM (
            SELECT curie, label, synonyms, ontology, subtree, obsolete, similarity(label, $2) AS score
            FROM public.ontology_term
            WHERE subtree = ANY($1) AND obsolete = false AND label % $2
            LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
          ) candidates
          ORDER BY score DESC, length(label) ASC, label ASC
          LIMIT $3`,
        [subtrees, trimmedQuery, rowLimit])
        await client.query('COMMIT')
        return rows
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined)
        if (err?.code === '57014') { // query_canceled: statement_timeout
          return { rows: [], cacheable: false } // may succeed when the DB is less busy
        }
        throw err
      } finally {
        release()
        fuzzyInFlight--
      }
    })
  },

}

export const Resolvers = {
  Query: QueryResolvers,
} as IResolvers<any, Context>
