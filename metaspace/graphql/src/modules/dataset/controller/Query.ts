import {DatasetSource, FieldResolversFor, ScopeRoleOptions as SRO} from '../../../bindingTypes';
import {Mutation, Query} from '../../../binding';
import {esCountGroupedResults, esCountResults, esDatasetByID, esSearchResults} from '../../../../esConnector';
import {db} from '../../../utils/knexDb';
import {Dataset as DatasetModel} from '../model';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../../group/model';
import {Context} from '../../../context';


const resolveDatasetScopeRole = async (ctx: Context, dsId: string) => {
  let scopeRole = SRO.OTHER;
  if (ctx.user) {
    if (ctx.user.role === 'admin') {
      scopeRole = SRO.ADMIN;
    }
    else {
      if (dsId) {
        const ds = await ctx.connection.getRepository(DatasetModel).findOne({
          where: { id: dsId }
        });
        if (ds) {
          const userGroup = await ctx.connection.getRepository(UserGroupModel).findOne({
            where: { userId: ctx.user.id, groupId: ds.groupId }
          });
          if (userGroup) {
            if (userGroup.role === UserGroupRoleOptions.GROUP_ADMIN)
              scopeRole = SRO.GROUP_MANAGER;
            else if (userGroup.role === UserGroupRoleOptions.MEMBER)
              scopeRole = SRO.GROUP_MEMBER;
          }
        }
      }
    }
  }
  return scopeRole;
};

export const rawOpticalImage = async (dsId: string, ctx: Context) => {
  // TODO: consider moving to Dataset type
  const ds = await esDatasetByID(dsId, ctx.user);  // check if user has access
  if (ds) {
    const row = await (db.from('dataset')
      .where('id', dsId)
      .first());
    if (row && row.optical_image) {
      return {
        url: `/fs/raw_optical_images/${row.optical_image}`,
        transform: row.transform
      };
    }
  }
  return null;
};

const QueryResolvers: FieldResolversFor<Query, void>  = {
  async dataset(source, { id: dsId }, ctx): Promise<DatasetSource | null> {
    // TODO: decide whether to support field level access here
    const scopeRole = await resolveDatasetScopeRole(ctx, dsId);
    const ds = await esDatasetByID(dsId, ctx.user);
    return ds ? { ...ds, scopeRole }: null;
  },

  async allDatasets(source, args, ctx): Promise<DatasetSource[]> {
    const translatedArgs = {
      ...args,
      datasetFilter: args.filter,
      filter: {}
    };
    return await esSearchResults(translatedArgs, 'dataset', ctx.user);
  },

  async countDatasets(source, args, ctx): Promise<number> {
    const translatedArgs = {
      ...args,
      datasetFilter: args.filter,
      filter: {}
    };
    return await esCountResults(translatedArgs, 'dataset', ctx.user);
  },

  async countDatasetsPerGroup(source, {query}, ctx) {
    const args = {
      datasetFilter: query.filter,
      simpleQuery: query.simpleQuery,
      filter: {},
      groupingFields: query.fields
    };
    return await esCountGroupedResults(args, 'dataset', ctx.user);
  },

  async opticalImageUrl(source, {datasetId: dsId, zoom = 1}, ctx) {
    // TODO: consider moving to Dataset type
    const ds = await esDatasetByID(dsId, ctx.user);  // check if user has access
    if (ds) {
      const intZoom = zoom <= 1.5 ? 1 : (zoom <= 3 ? 2 : (zoom <= 6 ? 4 : 8));
      // TODO: manage optical images on the graphql side
      const row = await (db.from('optical_image')
        .where('ds_id', dsId)
        .where('zoom', intZoom)
        .first());
      return (row) ? `/fs/optical_images/${row.id}` : null;
    }
    return null;
  },

  async rawOpticalImage(source, {datasetId: dsId}, ctx) {
    return await rawOpticalImage(dsId, ctx);
  },

  // TODO: deprecated, remove
  async thumbnailImage(source, {datasetId}, ctx) {
    return QueryResolvers.thumbnailOpticalImageUrl!(source, {datasetId}, ctx, null as any);
  },

  async thumbnailOpticalImageUrl(source, {datasetId: dsId}, ctx) {
    // TODO: consider moving to Dataset type
    const ds = await esDatasetByID(dsId, ctx.user);  // check if user has access
    if (ds) {
      const row = await (db.from('dataset')
        .where('id', dsId)
        .first());
      if (row && row.thumbnail) {
        return `/fs/optical_images/${row.thumbnail}`;
      }
    }
    return null;
  },

  async currentUserLastSubmittedDataset(source, args, ctx): Promise<DatasetSource | null> {

    const {user} = ctx;
    if (user) {
      const results = await esSearchResults({
        orderBy: 'ORDER_BY_DATE',
        sortingOrder: 'DESCENDING',
        datasetFilter: {
          submitter: user.id,
        },
        limit: 1,
      }, 'dataset', user);
      if (results.length > 0) {
        return {
          ...results[0],
          scopeRole: await resolveDatasetScopeRole(ctx, results[0]._source.ds_id),
        }
      }
    }
    return null;
  },

};

export default QueryResolvers;
