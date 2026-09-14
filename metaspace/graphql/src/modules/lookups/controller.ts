import { FieldResolversFor } from '../../bindingTypes'
import { Query } from '../../binding'
import { esFilterValueCountResults } from '../../../esConnector'
import config from '../../utils/config'
import { Context, ContextUser } from '../../context'
import { IResolvers } from 'graphql-tools'
import { ScoringModel } from '../engine/model'

// Slot -> reachable_from root CURIE(s), mirroring schema/metaspace_submission.yaml's `reachable_from`
// declarations in the metaspace_metadata repo. TODO(metadata schema v2): once that schema is vendored
// (blocked as of writing on the schema repo's own 0.2.0 release), read this table from the vendored
// generated JSON Schema instead of hand-maintaining it here, per integration spec SS6 - "the ontology
// import table is read from the schema, not transcribed into METASPACE" is the whole point of that
// design; this hardcoded copy is a stopgap so the resolver has something correct to scope against in
// the meantime, not the intended long-term source of truth.
const SLOT_SUBTREES: Record<string, string[]> = {
  organism: ['NCBITaxon:131567'],
  anatomical_site_coarse: ['UBERON:0001062'],
  disease: ['MONDO:0000001'],
  developmental_stage: ['EFO:0000399'],
  cell_line_id: ['EFO:0000322'],
  ionization_source: ['MS:1000008'],
  // instrument_model spans two PSI-MS subtrees (vendor models vs. bare analyzer types) - see
  // design_decisions.md's "Flagged coverage problems" and integration spec SS6.
  instrument_model: ['MS:1000031', 'MS:1000443'],
  maldi_matrix: ['CHEBI:24431'],
  solvent: ['CHEBI:24431'],
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
    if (!subtrees || subtrees.length === 0) {
      // Unknown slot, or a slot with no ontology binding (e.g. genetic_background, which is
      // free-text-first by design - see design_decisions.md). Not an error: the webapp's
      // ontologyTerm field always offers free text as a fallback regardless of what this returns.
      return []
    }
    // Postgres query semantics, not this table (curie, subtree) design: `similarity()` is only
    // meaningful once the two strings actually overlap trigram-wise, so an empty `query` (browsing
    // rather than searching) is handled as "match everything in scope" via the ILIKE branch alone,
    // same convention as metadataSuggestions' `query ? '*${query}*' : '*'` above.
    const pattern = `%${query || ''}%`
    return await ctx.entityManager.query(`
      SELECT curie, label, synonyms, ontology, subtree, obsolete
      FROM public.ontology_term
      WHERE subtree = ANY($1)
        AND obsolete = false
        AND (
          label ILIKE $2
          OR EXISTS (SELECT 1 FROM unnest(synonyms) syn WHERE syn ILIKE $2)
        )
      ORDER BY similarity(label, $3) DESC, label ASC
      LIMIT $4`,
    [subtrees, pattern, query || '', limit || 10])
  },

}

export const Resolvers = {
  Query: QueryResolvers,
} as IResolvers<any, Context>
