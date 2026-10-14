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
    // Two stages, both ranked shortest label first. Stage 1 is a label prefix match through the plain
    // btree on lower(label), cheap at any table size and what people usually type ("homo s"). Stage 2
    // runs only when prefixes don't fill the limit: substring matches on label or synonyms through the
    // trigram GIN indexes. Each stage sorts at most ONTOLOGY_CANDIDATE_LIMIT matching rows: a
    // low-information token like "sp." matches 1.4M NCBITaxon rows, and sorting them all costs
    // seconds, while the first thousand in index order give an equally useful shortlist.
    return await cachedOntologySuggestions(`${slot}\0${trimmedQuery.toLowerCase()}\0${rowLimit}`, async() => {
      const prefixRows: any[] = await ctx.entityManager.query(`
        SELECT curie, label, synonyms, ontology, subtree, obsolete FROM (
          SELECT curie, label, synonyms, ontology, subtree, obsolete
          FROM public.ontology_term
          WHERE subtree = ANY($1) AND obsolete = false AND lower(label) LIKE $2
          LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
        ) candidates
        ORDER BY length(label) ASC, label ASC
        LIMIT $3`,
      [subtrees, `${escaped.toLowerCase()}%`, rowLimit])
      if (prefixRows.length >= rowLimit) {
        return prefixRows
      }
      const substringRows: any[] = await ctx.entityManager.query(`
        SELECT curie, label, synonyms, ontology, subtree, obsolete FROM (
          SELECT curie, label, synonyms, ontology, subtree, obsolete, (label ILIKE $3) AS label_hit
          FROM public.ontology_term
          WHERE subtree = ANY($1) AND obsolete = false
            AND NOT (lower(label) LIKE $2)
            AND (label ILIKE $3 OR ontology_term_synonym_text(synonyms) ILIKE $3)
          LIMIT ${ONTOLOGY_CANDIDATE_LIMIT}
        ) candidates
        ORDER BY label_hit DESC, length(label) ASC, label ASC
        LIMIT $4`,
      [subtrees, `${escaped.toLowerCase()}%`, `%${escaped}%`, rowLimit - prefixRows.length])
      if (prefixRows.length + substringRows.length > 0) {
        return [...prefixRows, ...substringRows]
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
