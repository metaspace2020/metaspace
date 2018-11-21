import * as _ from 'lodash';
import {dsField} from '../../../../datasetFilters';
import {DatasetSource, FieldResolversFor} from '../../../bindingTypes';
import {ProjectSourceRepository} from '../../project/ProjectSourceRepository';
import {Dataset as DatasetModel} from '../model';
import {Dataset} from '../../../binding';
import {rawOpticalImage} from './Query';
import getScopeRoleForEsDataset from '../util/getScopeRoleForEsDataset';
import {logger} from '../../../utils';

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

  group(ds) {
    if (ds._source.ds_group_id) {
      return {
        id: ds._source.ds_group_id,
        name: ds._source.ds_group_name || 'NULL',
        shortName: ds._source.ds_group_short_name || 'NULL',
        urlSlug: null,
        members: null,
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
    const canSeeUnapprovedProjects = ctx.isAdmin || (ctx.user != null && ctx.user.id === ds._source.ds_submitter_id);
    if (!canSeeUnapprovedProjects && projectIds.length === 0) {
      return [];
    }

    const projects = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectsByDatasetId(ctx.user, ds._source.ds_id);
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      isPublic: null,
      urlSlug: null,
    }));
  },

  async principalInvestigator(ds, _, {connection, isAdmin, user}) {
    const dataset = await connection.getRepository(DatasetModel).findOne({ id: ds._source.ds_id });
    if (dataset == null) {
      logger.warn(`Elasticsearch DS does not exist in DB: ${ds._source.ds_id}`);
      return null;
    }
    const canSeePiEmail = isAdmin || (user != null && user.id === ds._source.ds_submitter_id);
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
    // @ts-ignore
    return await rawOpticalImage(ds._source.ds_id, ctx).url;
  },

  async rawOpticalImageUrl(ds, _, ctx) {
    // @ts-ignore
    return await rawOpticalImage(ds._source.ds_id, ctx).url;
  }
};

export default DatasetResolvers;
