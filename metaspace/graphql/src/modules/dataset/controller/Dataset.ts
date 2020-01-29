import * as _ from 'lodash';
import {dsField} from '../../../../datasetFilters';
import {DatasetSource, FieldResolversFor} from '../../../bindingTypes';
import {ProjectSourceRepository} from '../../project/ProjectSourceRepository';
import {Dataset as DatasetModel} from '../model';
import {EngineDataset, OpticalImage as OpticalImageModel} from '../../engine/model';
import {Dataset, OpticalImage, OpticalImageType} from '../../../binding';
import getScopeRoleForEsDataset from '../operation/getScopeRoleForEsDataset';
import logger from '../../../utils/logger';
import {Context} from '../../../context';
import getGroupAdminNames from '../../group/util/getGroupAdminNames';
import * as DataLoader from 'dataloader';
import {esDatasetByID} from '../../../../esConnector';
import {ExternalLink} from '../../project/ExternalLink';

interface DbDataset {
  id: string;
  thumbnail: string | null;
  ion_thumbnail: string | null;
  transform: number[][] | null;
  external_links: ExternalLink[] | null;
}
const getDbDatasetById = async (ctx: Context, id: string): Promise<DbDataset | null> => {
  const dataloader = ctx.contextCacheGet('getDbDatasetByIdDataLoader', [], () => {
    return new DataLoader(async (datasetIds: string[]): Promise<any[]> => {
      const results = await ctx.entityManager.query(`
      SELECT ds.id, ds.thumbnail, ds.ion_thumbnail, ds.transform, gds.external_links
      FROM public.dataset ds
      JOIN graphql.dataset gds on ds.id = gds.id
      WHERE ds.id = ANY($1)`,
        [datasetIds]);
      const keyedResults = _.keyBy(results, 'id');
      return datasetIds.map(id => keyedResults[id] || null);
    });
  });
  return await dataloader.load(id);
};

export const thumbnailOpticalImageUrl = async (ctx: Context, datasetId: string) => {
  const result = await getDbDatasetById(ctx, datasetId);
  if (result && result.thumbnail != null) {
    return `/fs/optical_images/${result.thumbnail}`;
  } else {
    return null;
  }
};

const getOpticalImagesByDsId = async (ctx: Context, id: string): Promise<OpticalImage[]> => {
  const dataloader = ctx.contextCacheGet('getOpticalImagesByDsIdDataLoader', [], () => {
    return new DataLoader(async (datasetIds: string[]): Promise<OpticalImage[][]> => {
      const rawResults: OpticalImageModel[] = await ctx.entityManager.query(
        'SELECT * from public.optical_image WHERE ds_id = ANY($1)', [datasetIds]);
      const results = rawResults.map(({id, type, ...rest}) => ({
        ...rest,
        id,
        url: `/fs/optical_images/${id}`,
        type: type.toUpperCase() as OpticalImageType,
      }));
      const groupedResults = _.groupBy(results, 'ds_id');
      return datasetIds.map(id => groupedResults[id] || []);
    });
  });
  return await dataloader.load(id);
};

export const rawOpticalImage = async (datasetId: string, ctx: Context) => {
  const ds = await esDatasetByID(datasetId, ctx.user);  // check if user has access
  if (ds) {
    const engineDataset = await ctx.entityManager.getRepository(EngineDataset).findOne(datasetId);
    if (engineDataset && engineDataset.opticalImage) {
      return {
        url: `/fs/raw_optical_images/${engineDataset.opticalImage}`,
        transform: engineDataset.transform
      };
    }
  }
  return null;
};


const DatasetResolvers: FieldResolversFor<Dataset, DatasetSource> = {
  id(ds) {
    return ds._source.ds_id;
  },

  name(ds) {
    return ds._source.ds_name;
  },

  uploadDT(ds) {
    return ds._source.ds_upload_dt;
  },

  configJson(ds) {
    return JSON.stringify(ds._source.ds_config);
  },

  metadataJson(ds) {
    return JSON.stringify(ds._source.ds_meta);
  },

  isPublic(ds) {
    return ds._source.ds_is_public;
  },

  molDBs(ds) {
    return ds._source.ds_mol_dbs;
  },

  adducts(ds) {
    return ds._source.ds_adducts;
  },

  neutralLosses(ds) {
    return ds._source.ds_neutral_losses;
  },

  chemMods(ds) {
    return ds._source.ds_chem_mods;
  },

  acquisitionGeometry(ds) {
    return JSON.stringify(ds._source.ds_acq_geometry);
  },

  organism(ds) { return dsField(ds, 'organism'); },
  organismPart(ds) { return dsField(ds, 'organismPart'); },
  condition(ds) { return dsField(ds, 'condition'); },
  growthConditions(ds) { return dsField(ds, 'growthConditions'); },
  polarity(ds) { return dsField(ds, 'polarity').toUpperCase(); },
  ionisationSource(ds) { return dsField(ds, 'ionisationSource'); },
  maldiMatrix(ds) { return dsField(ds, 'maldiMatrix'); },
  metadataType(ds) { return dsField(ds, 'metadataType'); },

  async submitter(ds, args, ctx) {
    if (ds._source.ds_submitter_id == null) {
      // WORKAROUND: Somehow datasets become broken and are indexed without a submitter
      logger.error('Submitter ID is null: ', _.pick(ds._source, ['ds_id', 'ds_name', 'ds_status', 'ds_submitter_id', 'ds_submitter_name', 'ds_submitter_email']));
    }

    return {
      id: ds._source.ds_submitter_id || 'NULL',
      name: ds._source.ds_submitter_name,
      email: ds._source.ds_submitter_email,
      scopeRole: await getScopeRoleForEsDataset(ds, ctx),
    };
  },

  group(ds, args, ctx) {
    if (ds._source.ds_group_id) {
      const groupId = ds._source.ds_group_id;
      return {
        id: groupId,
        name: ds._source.ds_group_name || 'NULL',
        shortName: ds._source.ds_group_short_name || 'NULL',
        urlSlug: null,
        members: null,
        get adminNames(): Promise<string[] | null> {
          return getGroupAdminNames(ctx, groupId);
        },
      };
    } else {
      return null;
    }
  },

  groupApproved(ds) {
    return ds._source.ds_group_approved === true;
  },

  async projects(ds, args, ctx) {
    // If viewing someone else's DS, only approved projects are visible, so exit early if there are no projects in elasticsearch
    const projectIds = _.castArray(ds._source.ds_project_ids).filter(id => id != null);
    const canSeeUnapprovedProjects = ctx.isAdmin || (ctx.user.id === ds._source.ds_submitter_id);
    if (!canSeeUnapprovedProjects && projectIds.length === 0) {
      return [];
    }

    const projects = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectsByDatasetId(ctx, ds._source.ds_id);
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      isPublic: null,
      urlSlug: null,
    }));
  },

  async principalInvestigator(ds, _, {cachedGetEntityById, isAdmin, user}: Context) {
    const dataset = await cachedGetEntityById(DatasetModel, ds._source.ds_id);
    if (dataset == null) {
      logger.warn(`Elasticsearch DS does not exist in DB: ${ds._source.ds_id}`);
      return null;
    }
    const canSeePiEmail = isAdmin || (user.id === ds._source.ds_submitter_id);
    if (dataset.piName) {
      return {
        name: dataset.piName,
        email: canSeePiEmail ? dataset.piEmail : null,
      };
    }
    return null;
  },

  analyzer(ds) {
    const msInfo = ds._source.ds_meta.MS_Analysis;
    return {
      'type': msInfo.Analyzer,
      'rp': msInfo.Detector_Resolving_Power
    };
  },

  status(ds) {
    return ds._source.ds_status;
  },

  inputPath(ds) {
    return ds._source.ds_input_path;
  },

  uploadDateTime(ds) {
    return ds._source.ds_upload_dt;
  },

  fdrCounts(ds, {inpFdrLvls, checkLvl}: {inpFdrLvls: number[], checkLvl: number}) {
    let outFdrLvls: number[] = [], outFdrCounts: number[] = [], maxCounts = 0, dbName = '';
    if(ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
      const annotCounts = ds._source.annotation_counts;
      const molDBs = ds._source.ds_mol_dbs;
      const filteredMolDBs: any[] = annotCounts.filter(el => {
        return molDBs.includes(el.db.name);
      });
      for (let db of filteredMolDBs) {
        let maxCountsCand = db.counts.find((lvlObj: any) => {
          return lvlObj.level === checkLvl
        });
        if (maxCountsCand.n >= maxCounts) {
          maxCounts = maxCountsCand.n;
          outFdrLvls = [];
          outFdrCounts = [];
          inpFdrLvls.forEach(inpLvl => {
            let findRes = db.counts.find((lvlObj: any) => {
              return lvlObj.level === inpLvl
            });
            if (findRes) {
              dbName = db.db.name;
              outFdrLvls.push(findRes.level);
              outFdrCounts.push(findRes.n);
            }
          })
        }
      }
      return {
        'dbName': dbName,
        'levels': outFdrLvls,
        'counts': outFdrCounts
      }
    }
    return null;
  },

  // TODO: field is deprecated, remove
  async opticalImage(ds, _, ctx) {
    const opticalImage = await rawOpticalImage(ds._source.ds_id, ctx);
    return opticalImage ? opticalImage.url : null;
  },

  async rawOpticalImageUrl(ds, _, ctx) {
    const opticalImage = await rawOpticalImage(ds._source.ds_id, ctx);
    return opticalImage ? opticalImage.url : null;
  },

  async thumbnailOpticalImageUrl(ds, args, ctx) {
    return await thumbnailOpticalImageUrl(ctx, ds._source.ds_id);
  },

  async opticalImages(ds, {type}: {type?: string}, ctx) {
    const opticalImages = await getOpticalImagesByDsId(ctx, ds._source.ds_id);
    return type != null
      ? opticalImages.filter(optImg => optImg.type === type)
      : opticalImages;
  },

  async opticalImageTransform(ds, args, ctx) {
    const datasetRow = await getDbDatasetById(ctx, ds._source.ds_id);
    return datasetRow != null ? datasetRow.transform : null;
  },

  async ionThumbnailUrl(ds, args, ctx) {
    const result = await getDbDatasetById(ctx, ds._source.ds_id);
    if (result && result.ion_thumbnail != null) {
      return `/fs/ion_thumbnails/${result.ion_thumbnail}`;
    } else {
      return null;
    }
  },

  async externalLinks(ds, args, ctx) {
    const dbDs = await getDbDatasetById(ctx, ds._source.ds_id);
    return dbDs && dbDs.external_links || [];
  }
};

export default DatasetResolvers;
