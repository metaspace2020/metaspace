import {UserError} from 'graphql-errors';
import fetch from 'node-fetch';
import * as _ from 'lodash';
import * as config from 'config';
import {esSearchResults, esCountResults, esCountGroupedResults,
  esAnnotationByID, esDatasetByID, esFilterValueCountResults} from './esConnector';
import {dsField, getPgField, SubstringMatchFilter} from './datasetFilters';
import {
  pgDatasetsViewableByUser,
  fetchEngineDS,
  fetchMolecularDatabases,
  deprecatedMolDBs,
  canUserViewPgDataset,
  wait,
  logger,
  pubsub,
  db
} from './utils';
import {Mutation as DSMutation} from './dsMutation';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from './src/modules/group/model';
import {Dataset as DatasetModel} from './src/modules/dataset/model';
import {ScopeRoleOptions as SRO} from './src/bindingTypes';
import {ProjectSourceRepository} from './src/modules/project/ProjectSourceRepository';


async function publishDatasetStatusUpdate(ds_id, status) {
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 5;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log({attempt, status});
      const ds = await esDatasetByID(ds_id, null, {});

      if (ds === null && status === 'DELETED') {
        await wait(1000);
        pubsub.publish('datasetStatusUpdated', {});
        return;
      } else if (ds !== null && status !== 'DELETED') {
        pubsub.publish('datasetStatusUpdated', {
          dataset: Object.assign({}, ds, { status }),
          dbDs: await fetchEngineDS({ id: ds_id })
        });
        return;
      }

      await wait(50 * attempt * attempt);
    }
  } catch (err) {
    logger.error(err);
  }

  logger.warn(`Failed to propagate dataset update for ${ds_id}`);
}

let queue = require('amqplib').connect(`amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`);
let rabbitmqChannel = 'sm_dataset_status';
queue.then(function(conn) {
  return conn.createChannel();
}).then(function(ch) {
  return ch.assertQueue(rabbitmqChannel).then(function(ok) {
    return ch.consume(rabbitmqChannel, function(msg) {
      const {ds_id, status} = JSON.parse(msg.content.toString());
      if (['QUEUED', 'ANNOTATING', 'FINISHED', 'FAILED', 'DELETED'].indexOf(status) >= 0)
        publishDatasetStatusUpdate(ds_id, status);
      ch.ack(msg);
    });
  });
}).catch(console.warn);

const resolveDatasetScopeRole = async (ctx, dsId) => {
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
            if (userGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR)
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

const Resolvers = {
  Query: {
    async dataset(_, { id: dsId }, ctx) {
      // TODO: decide whether to support field level access here
      const scopeRole = await resolveDatasetScopeRole(ctx, dsId);
      const ds = await esDatasetByID(dsId, ctx.user);
      return ds ? { ...ds, scopeRole }: null;
    },

    async allDatasets(_, args, ctx) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return await esSearchResults(args, 'dataset', ctx.user);
    },

    async allAnnotations(_, args, ctx) {
      return await esSearchResults(args, 'annotation', ctx.user);
    },

    async countDatasets(_, args, ctx) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return await esCountResults(args, 'dataset', ctx.user);
    },

    async countDatasetsPerGroup(_, {query}, ctx) {
      const args = {
        datasetFilter: query.filter,
        simpleQuery: query.simpleQuery,
        filter: {},
        groupingFields: query.fields
      };
      return await esCountGroupedResults(args, 'dataset', ctx.user);
    },

    async countAnnotations(_, args, ctx) {
      return await esCountResults(args, 'annotation', ctx.user);
    },

    async annotation(_, { id }, ctx) {
      return await esAnnotationByID(id, ctx.user);
    },

    async metadataSuggestions(_, {field, query, limit}, ctx) {
      const itemCounts = await esFilterValueCountResults({
        wildcard: { wildcard: { [`ds_meta.${field}`]: `*${query}*` } },
        aggsTerms: {
          terms: {
            field: `ds_meta.${field}.raw`,
            size: limit,
            order: { _count : 'desc' }
          }
        },
        limit
      }, ctx.user);
      return Object.keys(itemCounts);
    },

    adductSuggestions() {
      return config.defaults.adducts['-'].map(a => {
        return {adduct: a, charge: -1};
      }).concat(config.defaults.adducts['+'].map(a => {
        return {adduct: a, charge: 1};
      }));
    },

    async submitterSuggestions(_, {query}, ctx) {
      const itemCounts = await esFilterValueCountResults({
        wildcard: { wildcard: { ds_submitter_name: `*${query}*` } },
        aggsTerms: {
          terms: {
            script: {
              inline: "doc['ds_submitter_id'].value + '/' + doc['ds_submitter_name.raw'].value",
              lang: 'painless'
            },
            size: 1000,
            order: { _term : 'asc' }
          }
        }
      }, ctx.user);
      return Object.keys(itemCounts).map((s) => {
        const [id, name] = s.split('/');
        return { id, name }
      });
    },

    async molecularDatabases(_, args, ctx) {
      try {
        const {hideDeprecated, onlyLastVersion} = args;

        let molDBs = await fetchMolecularDatabases();
        if (hideDeprecated) {
          molDBs = molDBs.filter((molDB) => !deprecatedMolDBs.has(molDB.name));
        }
        for (let molDB of molDBs) {
          molDB['default'] = config.defaults.moldb_names.includes(molDB.name);
        }
        if (onlyLastVersion) {
          const molDBNameMap = new Map();
          for (let molDB of molDBs) {
            if (!molDBNameMap.has(molDB.name))
              molDBNameMap.set(molDB.name, molDB);
            else if (molDB.version > molDBNameMap.get(molDB.name).version)
              molDBNameMap.set(molDB.name, molDB);
          }
          molDBs = Array.from(molDBNameMap.values());
        }

        logger.debug(`Molecular databases: ` + JSON.stringify(molDBs));
        return molDBs;
      }
      catch (e) {
        logger.error(e);
        return 'Server error';
      }
    },

    async opticalImageUrl(_, {datasetId: dsId, zoom}, ctx) {
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

    async rawOpticalImage(_, {datasetId: dsId}, ctx) {
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
    },

    // TODO: deprecated, remove
    async thumbnailImage(_, {datasetId}, ctx) {
      return Resolvers.Query.thumbnailOpticalImageUrl(_, {datasetId}, ctx);
    },

    async thumbnailOpticalImageUrl(_, {datasetId: dsId}, ctx) {
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

    async currentUserLastSubmittedDataset(_, args, ctx) {
      let lastDS = null;
      const {user} = ctx;
      if (user) {
        const results = await esSearchResults({
          orderBy: 'ORDER_BY_DATE',
          sortingOrder: 'DESCENDING',
          submitter: user.id,
          limit: 1,
        }, 'dataset', user);
        if (results.length > 0) {
          lastDS = results[0];
        }
      }
      return lastDS;
    }
  },

  Analyzer: {
    resolvingPower(msInfo, { mz }) {
      const rpMz = msInfo.rp.mz,
        rpRp = msInfo.rp.Resolving_Power;
      if (msInfo.type.toUpperCase() == 'ORBITRAP')
        return Math.sqrt(rpMz / mz) * rpRp;
      else if (msInfo.type.toUpperCase() == 'FTICR')
        return (rpMz / mz) * rpRp;
      else
        return rpRp;
    }
  },

  Dataset: {
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

    institution(ds) { return dsField(ds, 'institution'); },
    organism(ds) { return dsField(ds, 'organism'); },
    organismPart(ds) { return dsField(ds, 'organismPart'); },
    condition(ds) { return dsField(ds, 'condition'); },
    growthConditions(ds) { return dsField(ds, 'growthConditions'); },
    polarity(ds) { return dsField(ds, 'polarity').toUpperCase(); },
    ionisationSource(ds) { return dsField(ds, 'ionisationSource'); },
    maldiMatrix(ds) { return dsField(ds, 'maldiMatrix'); },
    metadataType(ds) { return dsField(ds, 'metadataType'); },

    async submitter(ds, args, ctx) {
      let scopeRole = ds.scopeRole;
      if (ctx.user && ctx.user.id === ds._source.ds_submitter_id) {
        scopeRole = SRO.PROFILE_OWNER;
      }
      return {
        id: ds._source.ds_submitter_id,
        name: ds._source.ds_submitter_name,
        email: ds._source.ds_submitter_email,
        scopeRole,
      };
    },

    group(ds) {
      if (ds._source.ds_group_id) {
        return {
          id: ds._source.ds_group_id,
          name: ds._source.ds_group_name,
          shortName: ds._source.ds_group_short_name,
        };
      } else {
        return null;
      }
    },

    async projects(ds, args, ctx) {
      // If viewing someone else's DS, only approved projects are visible, so exit early if there are no projects in elasticsearch
      const projectIds = _.castArray(ds._source.ds_project_ids).filter(id => id != null);
      const canSeeUnapprovedProjects = ctx.isAdmin || (ctx.user != null && ctx.user.id === ds._source.ds_submitter_id);
      if (!canSeeUnapprovedProjects && projectIds.length === 0) {
        return [];
      }

      return ctx.connection.getCustomRepository(ProjectSourceRepository)
        .findProjectsByDatasetId(ctx.user, ds._source.ds_id);
    },

    async principalInvestigator(ds, _, {connection}) {
      const dataset = await connection.getRepository(DatasetModel).findOneOrFail({ id: ds._source.ds_id });
      if (dataset.piName) {
        return {
          name: dataset.piName,
          email: dataset.piEmail,
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

    fdrCounts(ds, {inpFdrLvls, checkLvl}) {
      let outFdrLvls = [], outFdrCounts = [], maxCounts = 0, dbName = '';
      if(ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
        let annotCounts = ds._source.annotation_counts;
        let molDBs = ds._source.ds_mol_dbs;
        let filteredMolDBs = annotCounts.filter(el => {
            return molDBs.includes(el.db.name);
        });
        for (let db of filteredMolDBs) {
          let maxCountsCand = db.counts.find(lvlObj => {
                return lvlObj.level === checkLvl
            });
            if (maxCountsCand.n >= maxCounts) {
              maxCounts = maxCountsCand.n;
              outFdrLvls = [];
              outFdrCounts = [];
              inpFdrLvls.forEach(inpLvl => {
                let findRes = db.counts.find(lvlObj => {
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
    },

    // TODO: field is deprecated, remove
    opticalImage(ds, _, ctx) {
      return Resolvers.Dataset.rawOpticalImageUrl(ds, _, ctx);
    },

    async rawOpticalImageUrl(ds, _, ctx) {
      return await Resolvers.Query.rawOpticalImage(_, {}, ctx).url;
    }
  },

  Annotation: {
    id(hit) {
      return hit._id;
    },

    sumFormula(hit) {
      return hit._source.sf;
    },

    possibleCompounds(hit) {
      const ids = hit._source.comp_ids;
      const names = hit._source.comp_names;
      let compounds = [];
      for (let i = 0; i < names.length; i++) {
        let id = ids[i];
        let dbName = hit._source.db_name,
          dbBaseName = dbName.split('-')[0];

        let infoURL;
        if (dbBaseName === 'HMDB') {
          infoURL = `http://www.hmdb.ca/metabolites/${id}`;
        } else if (dbBaseName === 'ChEBI') {
          infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
        } else if (dbBaseName === 'SwissLipids') {
          infoURL = `http://swisslipids.org/#/entity/${id}`;
        } else if (dbBaseName === 'LipidMaps') {
          infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
        } else if (dbBaseName === 'PAMDB') {
          infoURL = `http://pseudomonas.umaryland.edu/PAMDB?MetID=${id}`;
        }

        compounds.push({
          name: names[i],
          imageURL: `/mol-images/${dbBaseName}/${id}.svg`,
          information: [{database: dbName, url: infoURL, databaseId: id}]
        });
      }
      return compounds;
    },

    adduct: (hit) => hit._source.adduct,

    mz: (hit) => parseFloat(hit._source.centroid_mzs[0]),

    fdrLevel: (hit) => hit._source.fdr,

    msmScore: (hit) => hit._source.msm,

    rhoSpatial: (hit) => hit._source.image_corr,

    rhoSpectral: (hit) => hit._source.pattern_match,

    rhoChaos: (hit) => hit._source.chaos,

    dataset(hit) {
      return Object.assign({_id: hit._source.ds_id}, hit);
    },

    peakChartData(hit) {
      const {sf_adduct, ds_meta, ds_config, ds_id, mz} = hit._source;
      const msInfo = ds_meta.MS_Analysis;
      const host = config.services.moldb_service_host,
        pol = msInfo.Polarity.toLowerCase() == 'positive' ? '+1' : '-1';

      let rp = mz / (ds_config.isotope_generation.isocalc_sigma * 2.35482),
        ppm = ds_config.image_generation.ppm,
        theorData = fetch(`http://${host}/v1/isotopic_pattern/${sf_adduct}/tof/${rp}/400/${pol}`);

      return theorData.then(res => res.json()).then(json => {
        let {data} = json;
        data.ppm = ppm;
        return JSON.stringify(data);
      }).catch(e => logger.error(e));
    },

    isotopeImages(hit) {
      const {iso_image_ids, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints} = hit._source;
      return centroid_mzs.map(function(mz, i) {
        return {
          url: iso_image_ids[i] !== null ? `/${hit._source.ds_ion_img_storage}${config.img_upload.categories.iso_image.path}${iso_image_ids[i]}` : null,
          mz: parseFloat(mz),
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i]
        }
      });
    }
  },

  Mutation: {
    // for dev purposes only, not a part of the public API
    reprocessDataset: async (_, args, ctx) => {
      const {id, delFirst, priority} = args;
      const ds = await fetchEngineDS({id});
      if (ds === undefined)
        throw new UserError('DS does not exist');
      return DSMutation.create(_, {
        id: id, input: ds, reprocess: true,
        delFirst: delFirst, priority: priority
      }, ctx);
    },
    createDataset: DSMutation.create,
    updateDataset: DSMutation.update,
    deleteDataset: DSMutation.delete,
    addOpticalImage: DSMutation.addOpticalImage,
    deleteOpticalImage: DSMutation.deleteOpticalImage,
  },

  Subscription: {
    datasetStatusUpdated: {
      subscribe: () => pubsub.asyncIterator('datasetStatusUpdated'),
      resolve: (payload, _, context) => {
        if (payload.dataset && payload.dbDs && canUserViewPgDataset(payload.dbDs, context.user)) {
          return { dataset: payload.dataset };
        } else {
          // Empty payload indicates that the client should still refresh its dataset list
          return { dataset: null };
        }
      }
    },
  }
};

module.exports = Resolvers;
