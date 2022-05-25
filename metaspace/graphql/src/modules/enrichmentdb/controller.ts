import { Context } from '../../context'
import { EnrichmentDb, EnrichmentTerm, Query } from '../../binding'
import {
  EnrichmentDB as EnrichmentDbModel,
  EnrichmentTerm as EnrichmentTermModel,
  EnrichmentDBMoleculeMapping as EnrichmentDBMoleculeMappingModel, EnrichmentDBMoleculeMapping,
} from './model'
import { FieldResolversFor } from '../../bindingTypes'
import { IResolvers } from 'graphql-tools'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allEnrichmentDatabases(_: any, args: any, ctx: Context): Promise<EnrichmentDb[] | null> {
    const enrichmentDBS = await ctx.entityManager.createQueryBuilder(EnrichmentDbModel, 'enrichmentdb')
      .getMany()
    if (enrichmentDBS) {
      return enrichmentDBS
    }
    return null
  },
  async allEnrichmentTerms(_: any, {
    databaseId,
    enrichmentName, limit,
  }: any, ctx: Context): Promise<EnrichmentTerm[] | null> {
    const enrichmentTerms = await ctx.entityManager
      .createQueryBuilder(EnrichmentTermModel, 'terms')
      .where((qb) => {
        qb.where('terms.enrichmentDbId = :databaseId', { databaseId })
        if (enrichmentName) {
          qb.andWhere('LOWER(terms.enrichmentName) like LOWER(:enrichmentName)',
            { enrichmentName: `%${enrichmentName.trim()}%` })
        }
        qb.orderBy('terms.enrichmentName', 'ASC')
        qb.take(limit)
      })
      .getMany()

    if (enrichmentTerms) {
      return enrichmentTerms
    }
    return null
  },
  async allFormulasByEnrichmentTerm(_: any, {
    termId,
  }: any, ctx: Context): Promise<EnrichmentTerm[] | null> {
    const enrichmentTermsMapping = await ctx.entityManager.createQueryBuilder(EnrichmentDBMoleculeMappingModel,
      'mapping')
      .leftJoin('mapping.enrichmentTerm', 'terms')
      .select(['mapping.formula'])
      .distinct(true)
      .where('mapping.enrichmentTermId = :termId', { termId })
      .getRawMany()

    if (enrichmentTermsMapping) {
      return enrichmentTermsMapping.map((term: any) => term.mapping_formula)
    }
    return null
  },
}

export const Resolvers = {
  Query: QueryResolvers,
} as IResolvers<any, Context>
