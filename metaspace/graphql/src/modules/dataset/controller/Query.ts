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
  DiffRoi,
  Roi,
  EngineDataset,
} from '../../engine/model'
import {
  EnrichmentBootstrap,
  EnrichmentDB,
  EnrichmentDBMoleculeMapping,
  EnrichmentTerm,
} from '../../enrichmentdb/model'
import { smApiJsonPost, smApiJsonGet } from '../../../utils/smApi/smApiCall'
import { smApiDatasetRequest } from '../../../utils'
import { uniq } from 'lodash'
import { UserError } from 'graphql-errors'
import { ColocAnnotation, Ion } from '../../annotation/model'
import * as _ from 'lodash'
import { unpackAnnotation } from '../../annotation/controller/Query'

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
    datasetId, molDbId, ontologyId, fdr = 0.5,
    offSample = undefined,
    colocalizedWith = undefined,
    pValue = undefined,
  }, ctx) {
    if (await esDatasetByID(datasetId, ctx.user)) { // check if user has access
      try {
        let idsWithOffSampleFilter : any = []
        let colocIons : any = []

        // get default ontology
        if (!ontologyId) {
          const enrichmentDb = await ctx.entityManager.createQueryBuilder(EnrichmentDB,
            'enrichmentDb').getOne()
          ontologyId = enrichmentDb?.id
        }

        if (colocalizedWith !== undefined) {
          const annotation = await ctx.entityManager.createQueryBuilder(ColocAnnotation, 'colocAnnotation')
            .innerJoinAndSelect('colocAnnotation.colocJob', 'colocJob')
            .innerJoin(Ion as any, 'ion', 'colocAnnotation.ionId = ion.id')
            .where('colocJob.datasetId = :datasetId', { datasetId })
            .andWhere('colocJob.fdr <= :fdr', { fdr })
            .andWhere('colocJob.moldbId = :molDbId', { molDbId })
            .andWhere('ion.ion = :colocalizedWith', { colocalizedWith })
            .getOne()
          const colocAnnotIds : any = annotation?.colocIonIds || []
          const ions = await ctx.entityManager.findByIds(Ion, [annotation?.ionId, ...colocAnnotIds])
          const ionsById = new Map<number, Ion>(ions.map(ion => [ion.id, ion] as [number, Ion]))
          colocIons = _.uniq([annotation?.ionId, ...colocAnnotIds])
            .map(ionId => {
              const ion = ionsById.get(ionId)
              return ion != null ? (ion.formula + ion.adduct) : null
            })
            .filter(ion => ion != null)
        }

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
        let qb = ctx.entityManager.createQueryBuilder(EnrichmentBootstrap, 'bootstrap')
          .leftJoinAndSelect('bootstrap.enrichmentDBMoleculeMapping', 'enrichmentDBMoleculeMapping')
          .leftJoin('enrichmentDBMoleculeMapping.enrichmentTerm', 'enrichmentTerm')
        qb = qb.where('bootstrap.datasetId = :datasetId', { datasetId })
        qb = qb.andWhere('bootstrap.fdr <= :fdr', { fdr })
        qb = qb.andWhere('enrichmentTerm.enrichmentDbId = :ontologyId', { ontologyId })
        if (offSample !== undefined) {
          qb = qb.andWhere('bootstrap.annotationId IN (:...idsWithOffSampleFilter)', { idsWithOffSampleFilter })
        }

        if (colocalizedWith !== undefined && colocIons !== undefined) {
          qb = qb.andWhere('bootstrap.formulaAdduct IN (:...colocIons)', { colocIons })
        }

        qb.andWhere('enrichmentDBMoleculeMapping.molecularDbId = :molDbId', { molDbId })
        qb.orderBy('bootstrap.scenario', 'ASC')
        const bootstrap = await qb.getMany()

        const enrichmentTermsMapping = await ctx.entityManager.createQueryBuilder(EnrichmentDBMoleculeMapping,
          'mapping')
          .leftJoin('mapping.enrichmentTerm', 'terms')
          .where('mapping.molecularDbId = :molDbId', { molDbId })
          .andWhere('terms.enrichmentDbId = :ontologyId', { ontologyId })
          .groupBy('terms.enrichmentId')
          .select('terms.enrichmentId', 'enrichmentId')
          .addSelect('array_agg(mapping.moleculeEnrichedName)', 'names')
          .getRawMany()

        const enrichedTerms = await ctx.entityManager
          .find(EnrichmentTerm, {
            where: { enrichmentDbId: ontologyId },
          })

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
  async diffRoiResults(source: any, { datasetId, filter = {}, annotationFilter }: any, ctx: Context) {
    if (await esDatasetByID(datasetId, ctx.user)) {
      let qb = ctx.entityManager.createQueryBuilder(DiffRoi, 'diffRoi')
        .leftJoinAndSelect('diffRoi.roi', 'roi')
        .where('roi.datasetId = :datasetId', { datasetId })

      // Apply DiffRoi-specific filters at database level
      if (filter.minAuc !== undefined) {
        qb = qb.andWhere('diffRoi.auc >= :minAuc', { minAuc: filter.minAuc })
      }
      if (filter.maxAuc !== undefined) {
        qb = qb.andWhere('diffRoi.auc <= :maxAuc', { maxAuc: filter.maxAuc })
      }
      if (filter.minLfc !== undefined) {
        qb = qb.andWhere('diffRoi.lfc >= :minLfc', { minLfc: filter.minLfc })
      }
      if (filter.maxLfc !== undefined) {
        qb = qb.andWhere('diffRoi.lfc <= :maxLfc', { maxLfc: filter.maxLfc })
      }
      if (filter.roiId) {
        qb = qb.andWhere('roi.id = :roiId', { roiId: filter.roiId })
      }
      if (filter.roiName) {
        qb = qb.andWhere('roi.name ILIKE :roiName', { roiName: `%${filter.roiName}%` })
      }

      const diffRois = await qb.getMany()

      // Get unique annotation IDs and build ES filter
      const ionIds = uniq(diffRois.map((diffRoi: any) => `${datasetId}_${diffRoi.annotationId}`)).join('|')

      // Build Elasticsearch filter combining annotationId and annotation filters
      const esFilter = { annotationId: ionIds, ...annotationFilter }

      const annotations = await esSearchResults({ filter: esFilter }, 'annotation', ctx.user)

      // Create a map for quick annotation lookup
      const annotationMap = new Map()
      annotations.forEach((ann: any) => {
        annotationMap.set(ann._id, unpackAnnotation(ann))
      })

      // Map diffRois to results with annotations
      const filteredResults = diffRois.map((diffRoi: any) => {
        const annotationId = `${datasetId}_${diffRoi.annotationId}`
        const annotation = annotationMap.get(annotationId)

        return {
          roi: {
            id: diffRoi.roi.id,
            datasetId: diffRoi.roi.datasetId,
            userId: diffRoi.roi.userId,
            name: diffRoi.roi.name,
            isDefault: diffRoi.roi.isDefault,
            geojson: JSON.stringify(diffRoi.roi.geojson),
          },
          lfc: diffRoi.lfc,
          auc: diffRoi.auc,
          annotation,
        }
      }).filter((result: any) => result.annotation) // Filter out results without annotations

      if (filter.topNAnnotations !== undefined) {
        const topResults: any[] = []
        const sortedResults = filteredResults.sort((a: any, b: any) => b.auc - a.auc)
        const roiHashCount: any = {}
        sortedResults.forEach((result: any) => {
          if (!roiHashCount[result.roi.id]) {
            roiHashCount[result.roi.id] = 0
          }
          roiHashCount[result.roi.id]++
          if (roiHashCount[result.roi.id] <= filter.topNAnnotations) {
            topResults.push(result)
          }
        })
        return topResults
      }

      return filteredResults
    }
    return []
  },

  async rois(source: any, { datasetId, userId }: any, ctx: Context) {
    try {
      if (await esDatasetByID(datasetId, ctx.user)) {
        let qb = ctx.entityManager.createQueryBuilder(Roi, 'roi')
          .where('roi.datasetId = :datasetId', { datasetId })

        if (userId) {
          qb = qb.andWhere('roi.userId = :userId', { userId })
        }

        qb = qb.orderBy('roi.isDefault', 'DESC')
          .addOrderBy('roi.name', 'ASC')

        const rois = await qb.getMany()

        // If no ROIs found in the new table, check the old dataset.roi column for backward compatibility
        if (rois.length === 0) {
          const legacyRoi = await ctx.entityManager.createQueryBuilder(EngineDataset, 'dataset')
            .select('dataset.roi')
            .where('dataset.id = :datasetId', { datasetId })
            .getRawOne()

          if (legacyRoi?.dataset_roi) {
            // Convert legacy ROI format to new format
            const legacyRoiData = legacyRoi.dataset_roi
            if (legacyRoiData?.features) {
              return legacyRoiData.features.map((feature: any, index: number) => ({
                id: `legacy_${index}`, // Temporary ID for legacy ROIs
                datasetId,
                userId: null, // Legacy ROIs don't have user association
                name: feature.properties?.name || `Legacy ROI ${index + 1}`,
                isDefault: false,
                geojson: JSON.stringify(feature),
              }))
            }
          }
        }

        return rois.map((roi: any) => ({
          id: roi.id,
          datasetId: roi.datasetId,
          userId: roi.userId,
          name: roi.name,
          isDefault: roi.isDefault,
          geojson: JSON.stringify(roi.geojson),
        }))
      }
      return []
    } catch (error) {
      console.error('Error in rois resolver:', error)
      throw error
    }
  },

  async roi(source: any, { id }: any, ctx: Context) {
    const roi = await ctx.entityManager.findOne(Roi, { where: { id } })
    if (roi) {
      // Check if user has access to the dataset
      if (await esDatasetByID(roi.datasetId, ctx.user)) {
        return {
          id: roi.id,
          datasetId: roi.datasetId,
          userId: roi.userId,
          name: roi.name,
          isDefault: roi.isDefault,
          geojson: JSON.stringify(roi.geojson),
        }
      }
    }
    return null
  },
  async currentUserLastSubmittedDataset(source, args, ctx): Promise<DatasetSource | null> {
    try {
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
    } catch (e) {
      return null
    }

    return null
  },
}

export default QueryResolvers
