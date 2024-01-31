import { DatasetSource, FieldResolversFor, ScopeRoleOptions as SRO } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { esCountGroupedResults, esCountResults, esDatasetByID, esSearchResults } from '../../../../esConnector'
import { Dataset as DatasetModel } from '../model'
import { UserGroup as UserGroupModel, UserGroupRoleOptions } from '../../group/model'
import { Context } from '../../../context'
import { thumbnailOpticalImageUrl, rawOpticalImage } from './Dataset'
import { applyQueryFilters } from '../../annotation/queryFilters'
import {
  OpticalImage,
} from '../../engine/model'
import {
  EnrichmentBootstrap,
  EnrichmentDBMoleculeMapping,
  EnrichmentTerm,
} from '../../enrichmentdb/model'
import { smApiJsonPost, smApiJsonGet } from '../../../utils/smApi/smApiCall'
import { smApiDatasetRequest } from '../../../utils'
import { uniq } from 'lodash'
import { UserError } from 'graphql-errors'
// import { unpackAnnotation } from '../../annotation/controller/Query'

const resolveDatasetScopeRole = async(ctx: Context, dsId: string) => {
  let scopeRole = SRO.OTHER
  if (ctx.user.id) {
    if (dsId) {
      const ds = await ctx.cachedGetEntityById(DatasetModel, dsId)
      if (ds && ds.groupId != null) {
        const userGroup = await ctx.cachedGetEntityById(UserGroupModel, { userId: ctx.user.id, groupId: ds.groupId })
        if (userGroup) {
          if (userGroup.role === UserGroupRoleOptions.GROUP_ADMIN) {
            scopeRole = SRO.GROUP_MANAGER
          } else if (userGroup.role === UserGroupRoleOptions.MEMBER) {
            scopeRole = SRO.GROUP_MEMBER
          }
        }
      }
    }
  }
  return scopeRole
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async dataset(source, { id: dsId }, ctx): Promise<DatasetSource | null> {
    const ds = await esDatasetByID(dsId, ctx.user)
    return ds || null
  },

  async allDatasets(source, args, ctx): Promise<DatasetSource[]> {
    const { args: filteredArgs } = await applyQueryFilters(ctx, {
      ...args,
      datasetFilter: args.filter,
      filter: {},
    })
    return await esSearchResults(filteredArgs, 'dataset', ctx.user)
  },

  async countDatasets(source, args, ctx): Promise<number> {
    const { args: filteredArgs } = await applyQueryFilters(ctx, {
      ...args,
      datasetFilter: args.filter,
      filter: {},
    })
    return await esCountResults(filteredArgs, 'dataset', ctx.user)
  },

  async countDatasetsPerGroup(source, { query }, ctx) {
    const { args } = await applyQueryFilters(ctx, {
      datasetFilter: query.filter,
      simpleQuery: query.simpleQuery,
      filter: {},
    })
    const groupArgs = {
      ...args,
      groupingFields: query.fields,
    }
    return await esCountGroupedResults(groupArgs, 'dataset', ctx.user)
  },

  async opticalImageUrl(source, { datasetId, zoom = 1 }, ctx) {
    // TODO: consider moving to Dataset type
    if (await esDatasetByID(datasetId, ctx.user)) { // check if user has access
      const intZoom = zoom <= 1.5 ? 1 : (zoom <= 3 ? 2 : (zoom <= 6 ? 4 : 8))
      // TODO: manage optical images on the graphql side
      const opticalImage = await ctx.entityManager.getRepository(OpticalImage)
        .findOne({ datasetId, zoom: intZoom })
      return (opticalImage) ? `/fs/optical_images/${opticalImage.id}` : null
    }
    return null
  },

  async lipidEnrichment(source, {
    datasetId, molDbId, fdr = 0.5,
    offSample = undefined,
    pValue = undefined,
  }, ctx) {
    if (await esDatasetByID(datasetId, ctx.user)) { // check if user has access
      try {
        let idsWithOffSampleFilter : any = []

        // get molecules by dsId and off sample filter
        if (offSample !== undefined) {
          const offSampleIons = await esSearchResults({
            datasetFilter: { ids: datasetId },
            filter: { databaseId: molDbId, offSample: offSample, fdrLevel: fdr },
            limit: 50000,
          }
          , 'annotation', ctx.user)
          idsWithOffSampleFilter = uniq(offSampleIons.map((item: any) => item._source?.annotation_id))
        }

        // get pre-calculate bootstrap with desired filters
        const bootstrap = await ctx.entityManager
          .find(EnrichmentBootstrap, {
            join: {
              alias: 'bootstrap',
              leftJoin: { enrichmentDBMoleculeMapping: 'bootstrap.enrichmentDBMoleculeMapping' },
            },
            where: (qb : any) => {
              qb.where('bootstrap.datasetId = :datasetId', { datasetId })
              qb.andWhere('bootstrap.fdr <= :fdr', { fdr })
              if (offSample !== undefined) {
                qb.andWhere('bootstrap.annotationId IN (:...idsWithOffSampleFilter)', { idsWithOffSampleFilter })
              }
              qb.andWhere('enrichmentDBMoleculeMapping.molecularDbId = :molDbId', { molDbId })
              qb.orderBy('bootstrap.scenario', 'ASC')
            },
            relations: [
              'enrichmentDBMoleculeMapping',
            ],
          })

        const enrichmentTermsMapping = await ctx.entityManager.createQueryBuilder(EnrichmentDBMoleculeMapping,
          'mapping')
          .leftJoin('mapping.enrichmentTerm', 'terms')
          .where('mapping.molecularDbId = :molDbId', { molDbId })
          .groupBy('terms.enrichmentId')
          .select('terms.enrichmentId', 'enrichmentId')
          .addSelect('array_agg(mapping.moleculeEnrichedName)', 'names')
          .getRawMany()

        const enrichedTerms = await ctx.entityManager
          .find(EnrichmentTerm)

        // TODO: change to use this where clause when another enrichment_dbs are added
        // const enrichedTerms = await ctx.entityManager
        //   .find(EnrichmentTerm, {
        //     where: { enrichmentDbId: enrichmentDbId }, // LION
        //   })

        const bootstrappedSublist : any = []
        const enrichedSets : any = {}
        const termsHash : any = {}
        let termNames : any = []
        const termsIdHash : any = {}

        if (bootstrap) {
          bootstrap.forEach((bootItem: any) => {
            if (!bootstrappedSublist[bootItem.scenario]) {
              bootstrappedSublist[bootItem.scenario] = {}
            }
            bootstrappedSublist[bootItem.scenario][bootItem.formulaAdduct] =
              bootItem.enrichmentDBMoleculeMapping.moleculeEnrichedName
          })
        }

        if (enrichmentTermsMapping) {
          enrichmentTermsMapping.forEach((enrichedItem: any) => {
            enrichedSets[enrichedItem.enrichmentId] = enrichedItem.names
            termNames = termNames.concat(enrichedItem.names)
          })
        }
        termNames = termNames.sort().filter((item:any, pos:any, ary:any) => {
          return !pos || item !== ary[pos - 1]
        })
        enrichedSets.all = termNames
        if (enrichedTerms) {
          enrichedTerms.forEach((termItem: any) => {
            termsHash[termItem.enrichmentId] = termItem.enrichmentName
            termsIdHash[termItem.enrichmentId] = termItem.id
          })
        }

        const { content } = await smApiJsonPost('/v1/enrichment/calculate_enrichment', {
          enrichedSets,
          termsHash,
          bootstrappedSublist,
        })

        if (!content.data) {
          throw new UserError('No enrichment available')
        }

        const data = JSON.parse(content.data)

        // filter by p-value
        if (pValue) {
          data.enrichment = data.enrichment.filter((item: any) => item.pValue <= pValue)
        }

        // get annotations associated to enrichment
        for (let i = 0; i < data.enrichment.length; i++) {
          const item = data.enrichment[i]
          //   const mols = uniq(data.molecules
          //     .filter((term: any) => term.id === item.id)
          //     .map((term:any) => term.mols).flat())
          //   const bootstrapItems = await ctx.entityManager
          //     .find(EnrichmentBootstrap, {
          //       join: {
          //         alias: 'bootstrap',
          //         leftJoin: { enrichmentDBMoleculeMapping: 'bootstrap.enrichmentDBMoleculeMapping' },
          //       },
          //       where: (qb : any) => {
          //         qb.where('bootstrap.datasetId = :datasetId', { datasetId })
          //           .andWhere('bootstrap.fdr <= :fdr', { fdr })
          //           .andWhere('enrichmentDBMoleculeMapping.molecularDbId = :molDbId', { molDbId })
          //           .andWhere('enrichmentDBMoleculeMapping.moleculeEnrichedName IN (:...names)', { names: mols })
          //           .orderBy('bootstrap.scenario', 'ASC')
          //       },
          //       relations: [
          //         'enrichmentDBMoleculeMapping',
          //       ],
          //     })
          //   const ionIds = uniq(bootstrapItems.map((bItem: any) => `${datasetId}_${bItem.annotationId}`)).join('|')
          //   const annotations = await esSearchResults({ filter: { annotationId: ionIds } }
          //     , 'annotation', ctx.user)
          //   item.annotations = annotations.map(unpackAnnotation)
          item.termId = termsIdHash[item.id]
        }

        return data.enrichment
      } catch (e) {
        return e
      }
    }
    return []
  },

  // TODO: deprecated, remove
  async rawOpticalImage(source, { datasetId }, ctx) {
    return await rawOpticalImage(datasetId, ctx)
  },

  // TODO: deprecated, remove
  async thumbnailImage(source, { datasetId }, ctx) {
    return await thumbnailOpticalImageUrl(ctx, datasetId)
  },

  // TODO: deprecated, remove
  async thumbnailOpticalImageUrl(source, { datasetId }, ctx) {
    return await thumbnailOpticalImageUrl(ctx, datasetId)
  },

  async hasImzmlFiles(source, { datasetId }) {
    try {
      const resp = await smApiJsonGet(`/v1/browser/files/${datasetId}`)
      return resp.is_exist
    } catch (e) {
      return false
    }
  },
  async browserImage(source, { datasetId, mzLow, mzHigh }) {
    try {
      const resp = await smApiDatasetRequest('/v1/browser/intensity_by_mz', {
        ds_id: datasetId,
        mz_low: mzLow,
        mz_high: mzHigh,
      })
      return { image: resp.image, maxIntensity: resp.max_intensity }
    } catch (e) {
      return null
    }
  },
  async pixelSpectrum(source, { datasetId, x, y }) {
    try {
      const resp = await smApiDatasetRequest('/v1/browser/peaks_from_pixel', {
        ds_id: datasetId,
        x,
        y,
      })
      return resp
    } catch (e) {
      return null
    }
  },
  async currentUserLastSubmittedDataset(source, args, ctx): Promise<DatasetSource | null> {
    if (ctx.user.id) {
      const results = await esSearchResults({
        orderBy: 'ORDER_BY_DATE',
        sortingOrder: 'DESCENDING',
        datasetFilter: {
          submitter: ctx.user.id,
        },
        limit: 1,
      }, 'dataset', ctx.user)
      if (results.length > 0) {
        return {
          ...results[0],
          scopeRole: await resolveDatasetScopeRole(ctx, results[0]._source.ds_id),
        }
      }
    }
    return null
  },

}

export default QueryResolvers
