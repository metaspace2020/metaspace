import { FieldResolversFor } from '../../bindingTypes'
import { Query } from '../../binding'
import { esFilterValueCountResults } from '../../../esConnector'
import config from '../../utils/config'
import { Context, ContextUser } from '../../context'
import { IResolvers } from 'graphql-tools'
import { ScoringModel } from '../engine/model'

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

}

export const Resolvers = {
  Query: QueryResolvers,
} as IResolvers<any, Context>
