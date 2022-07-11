import { DatasetSource, FieldResolversFor, ScopeRoleOptions as SRO } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { esCountGroupedResults, esCountResults, esDatasetByID, esSearchResults } from '../../../../esConnector'
import { Dataset as DatasetModel } from '../model'
import { UserGroup as UserGroupModel, UserGroupRoleOptions } from '../../group/model'
import { Context } from '../../../context'
import { thumbnailOpticalImageUrl, rawOpticalImage } from './Dataset'
import { applyQueryFilters } from '../../annotation/queryFilters'
import { OpticalImage } from '../../engine/model'
import { smApiDatasetRequest } from '../../../utils'

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
      await smApiDatasetRequest('/v1/browser/peaks_from_pixel', {
        ds_id: datasetId,
        x: 0,
        y: 0,
      })
      return true
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
      return resp.image
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
