import {UserError} from 'graphql-errors';
import fetch from 'node-fetch';
import * as _ from 'lodash';
import * as config from 'config';
import {esSearchResults, esCountResults, esCountGroupedResults, esAnnotationByID, esDatasetByID} from './esConnector';
import {dsField, getPgField, SubstringMatchFilter} from './datasetFilters';
import {
  pgDatasetsViewableByUser,
  fetchEngineDS,
  fetchMolecularDatabases,
  deprecatedMolDBs,
  assertUserCanViewDataset,
  canUserViewPgDataset,
  wait,
  logger,
  pubsub,
  db
} from './utils';
import {Mutation as DSMutation} from './dsMutation';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from './src/modules/group/model';
import {User as UserModel} from './src/modules/user/model';
import {Dataset as DatasetModel} from './src/modules/dataset/model';
import {Context, ScopeRole, ScopeRoleOptions as SRO} from './src/context';


async function publishDatasetStatusUpdate(ds_id, status) {
  // wait until updates are reflected in ES so that clients can refresh their data
  const maxAttempts = 5;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log({attempt, status});
      const ds = await esDatasetByID(ds_id, null, true);

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

function checkPermissions(datasetId, payload) {
  return db.select().from('dataset').where('id', '=', datasetId)
    .then(records => {
      if (records.length == 0)
        throw new UserError(`No dataset with specified id: ${datasetId}`);
      metadata = records[0].metadata;

      let allowUpdate = false;
      if (payload.role == 'admin')
        allowUpdate = true;
      else if (payload.email == metadata.Submitted_By.Submitter.Email)
        allowUpdate = true;
      if (!allowUpdate)
        throw new UserError(`You don't have permissions to edit the dataset: ${datasetId}`);
    });
}

function baseDatasetQuery() {
  return db.from(function() {
    this.select(db.raw('dataset.id as id'),
                'name',
                db.raw('max(finish) as last_finished'),
                db.raw('dataset.status as status'),
                'metadata', 'config', 'input_path')
        .from('dataset').leftJoin('job', 'dataset.id', 'job.ds_id')
        .groupBy('dataset.id').as('tmp');
  });
}

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
  // Person: {
  //   // FIXME: Using id = name here until we have actual IDs
  //   id(obj) { return [obj.First_Name, obj.Surname].join('|||'); },
  //   name(obj) { return [obj.First_Name, obj.Surname].filter(n => n).join(' '); },
  //   email(obj) { return obj.Email; }
  // },

  Query: {
    async dataset (_, { id }, ctx) {
      const scopeRole = await resolveDatasetScopeRole(ctx, id);
      if ([SRO.ADMIN, SRO.GROUP_MANAGER, SRO.GROUP_MEMBER].includes(scopeRole)) {
        const args = {
          filter: {},
          datasetFilter: { ids: id }
        };
        const datasets = await esSearchResults(args, 'dataset', ctx.user);
        if (datasets) {
          return {
            ...datasets[0],
            scopeRole
          };
        }
      }
      return null;
    },

    async allDatasets(_, args, {user}) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return await esSearchResults(args, 'dataset', user);
    },

    async allAnnotations(_, args, {user}) {
      return await esSearchResults(args, 'annotation', user);
    },

    countDatasets(_, args, {user}) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return esCountResults(args, 'dataset', user);
    },

    countDatasetsPerGroup(_, {query}, {user}) {
      const args = {
        datasetFilter: query.filter,
        simpleQuery: query.simpleQuery,
        filter: {},
        groupingFields: query.fields
      };
      return esCountGroupedResults(args, 'dataset', user);
    },

    countAnnotations(_, args, {user}) {
      return esCountResults(args, 'annotation', user);
    },

    annotation(_, { id }, {user}) {
      return esAnnotationByID(id, user);
    },

    metadataSuggestions(_, { field, query, limit }, {user}) {
      let f = new SubstringMatchFilter(field, {}),
          q = db.from(pgDatasetsViewableByUser(user))
                .select(db.raw(f.pgField + " as field"))
                .groupBy('field').orderByRaw('count(*) desc').limit(limit);
      return f.pgFilter(q, query).orderBy('field', 'asc')
              .then(results => results.map(row => row['field']));
    },

    adductSuggestions() {
      return config.defaults.adducts['-'].map(a => {
        return {adduct: a, charge: -1};
      }).concat(config.defaults.adducts['+'].map(a => {
        return {adduct: a, charge: 1};
      }));
    },

    submitterSuggestions(_, { query }, {user}) {
      const schemaPath = 'Submitted_By.Submitter';
      const p1 = schemaPath + '.First_Name',
        p2 = schemaPath + '.Surname',
        f1 = getPgField(p1),
        f2 = getPgField(p2);
      const q = db.from(pgDatasetsViewableByUser(user))
                  .distinct(db.raw(`${f1} as name, ${f2} as surname`))
                  .whereRaw(`${f1} ILIKE ? OR ${f2} ILIKE ?`, ['%' + query + '%', '%' + query + '%']);
      logger.info(q.toString());
      return q.orderBy('name', 'asc').orderBy('surname', 'asc')
              .then(results => results.map(r => ({
                id: [r.name, r.surname].join('|||'),
                name: [r.name, r.surname].filter(n => n).join(' '),
              })))
    },

    async molecularDatabases(_, args, {user}) {
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

    opticalImageUrl(_, {datasetId, zoom}, {user}) {
      const intZoom = zoom <= 1.5 ? 1 : (zoom <= 3 ? 2 : (zoom <= 6 ? 4 : 8));
      assertUserCanViewDataset(datasetId, user);

      return db.select().from('optical_image')
          .where('ds_id', '=', datasetId)
          .where('zoom', '=', intZoom)
          .then(records => {
              if (records.length > 0)
                  return '/fs/optical_images/' + records[0].id;
              else
                  return null;
          })
          .catch((e) => {
              logger.error(e);
          })
    },

    rawOpticalImage(_, {datasetId}, {user}) {
      return db
        .from(pgDatasetsViewableByUser(user))
        .where('id', '=', datasetId)
        .then(records => {
          if (records.length > 0)
            return {
              url: '/fs/raw_optical_images/' + records[0].optical_image,
              transform: records[0].transform
            };
          else
            return null;
        })
        .catch((e) => {
          logger.error(e);
        })
    },

    thumbnailImage(_, {datasetId}) {
      return db.select().from('dataset')
        .where('id ', '=', datasetId)
        .then(records => {
          if (records.length > 0 && records[0].thumbnail != null) {
            return '/fs/optical_images/' + records[0].thumbnail;
          }
          else {
            return null;
          }
        })
        .catch(e => {
            logger.error(e);
        })
    },

    reprocessingNeeded(_, args, {user}) {
      return DSQuery.reprocessingNeeded(args, user);
    },

    currentUser(_, args, {user}) {
      if (user == null || user.name == null) {
        return null;
      }
      return {
        id: user.name.replace(/ /, '|||'), // TODO: Have actual user IDs
        name: user.name,
        role: user.role,
        email: user.email || null,
      }
    },

    async currentUserLastSubmittedDataset(_, args, {user}) {
      if (user == null || user.name == null) {
        return null;
      }
      const lastDataset = await db('dataset')
        .whereRaw("metadata#>>'{Submitted_By,Submitter,Email}' = ?", [user.email])
        .orderBy('upload_dt', 'desc')
        .select('id')
        .first();
      if (lastDataset != null) {
        return await esDatasetByID(lastDataset.id, user);
      } else {
        return null;
      }
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

    submitter({scopeRole, ...ds}) {
      return {
        id: ds._source.ds_submitter_id,
        name: ds._source.ds_submitter_name,
        email: ds._source.ds_submitter_email,
        scopeRole
      };
    },

    group(ds) {
      if (ds._source.ds_group_id) {
        return {
          id: ds._source.ds_group_id,
          name: ds._source.ds_group_name,
          shortName: ds._source.ds_group_short_name,
        }
      };
    },

    async principalInvestigator(ds, _, {connection}) {
      const userGroup = await connection.getRepository(UserGroupModel).findOneOrFail({
        where: {
          groupId: ds._source.ds_group_id,
          role: UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR
        },
        relations: ['user']
      });

      return {
        id: userGroup.user.id,
        name: userGroup.user.name,
        email: userGroup.user.email,
      }
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

    opticalImage(ds, _, context) {
      return Resolvers.Query.rawOpticalImage(null, {datasetId: ds._source.ds_id}, context)
          .then(optImage => {
            if (!optImage) {
              //non-existing optical image don't have transform value
              return 'noOptImage'
            }
            return optImage.url;
          }).catch((e) => {
            logger.error(e);
          })
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
    reprocessDataset: async (_, args, {user}) => {
      const {id, delFirst, priority} = args;
      const ds = await fetchEngineDS({id});
      if (ds === undefined)
        throw new UserError('DS does not exist');
      return DSMutation.create({
        id: id, input: ds, reprocess: true,
        delFirst: delFirst, priority: priority
      }, user);
    },

    createDataset: (_, args, context) => {
      return DSMutation.create(args, context);
    },

    updateDataset: (_, args, context) => {
      return DSMutation.update(args, context);
    },

    deleteDataset: (_, args, context) => {
      return DSMutation.delete(args, context);
    },

    addOpticalImage: (_, {input}, {user}) => {
      return DSMutation.addOpticalImage(input, user);
    },

    deleteOpticalImage: (_, args, {user}) => {
      return DSMutation.deleteOpticalImage(args, user);
    }
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
