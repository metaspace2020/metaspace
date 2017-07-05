const sprintf = require('sprintf-js'),
  fetch = require('node-fetch'),
  jwt = require('jwt-simple'),
  {UserError} = require('graphql-errors');

const config = require('config'),
  {esSearchResults, esCountResults,
   esAnnotationByID, esDatasetByID} = require('./esConnector'),
  {datasetFilters, dsField, getPgField, SubstringMatchFilter} = require('./datasetFilters.js'),
  {generateProcessingConfig, metadataChangeSlackNotify,
    metadataUpdateFailedSlackNotify, logger, pubsub} = require("./utils.js");

const dbConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

let pg = require('knex')({
  client: 'pg',
  connection: dbConfig(),
  searchPath: 'knex,public'
});

function publishDatasetStatusUpdate(ds_id, status, attempt=1) {
  // wait until updates are reflected in ES so that clients don't have to care
  const maxAttempts = 5;
  esDatasetByID(ds_id).then(function(ds) {
    if (attempt > maxAttempts) {
      console.warn(`Failed to propagate dataset update for ${ds_id}`);
      return;
    }
    console.log(attempt, status, ds === null);

    if (ds === null && status == 'DELETED') {
      setTimeout(() => { pubsub.publish('datasetDeleted', {datasetId: ds_id}); }, 1000);
    } else if (ds !== null && status != 'DELETED') {
      const dataset = Object.assign({}, ds, {status});
      pubsub.publish('datasetStatusUpdated', {dataset});
    } else {
      setTimeout(publishDatasetStatusUpdate,
                 50 * attempt * attempt,
                 ds_id, status, attempt + 1);
    }
  });
}

let queue = require('amqplib').connect(`amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`);
let rabbitmqChannel = 'sm_dataset_status';
queue.then(function(conn) {
  return conn.createChannel();
}).then(function(ch) {
  return ch.assertQueue(rabbitmqChannel).then(function(ok) {
    return ch.consume(rabbitmqChannel, function(msg) {
      const {ds_id, status} = JSON.parse(msg.content.toString());
      if (['QUEUED', 'STARTED', 'FINISHED', 'FAILED', 'DELETED'].indexOf(status) >= 0)
        publishDatasetStatusUpdate(ds_id, status);
      ch.ack(msg);
    });
  });
}).catch(console.warn);

function checkPermissions(datasetId, payload) {
  return pg.select().from('dataset').where('id', '=', datasetId)
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
  return pg.from(function() {
    this.select(pg.raw('dataset.id as id'),
                'name',
                pg.raw('max(finish) as last_finished'),
                pg.raw('dataset.status as status'),
                'metadata', 'config', 'input_path')
        .from('dataset').leftJoin('job', 'dataset.id', 'job.ds_id')
        .groupBy('dataset.id').as('tmp');
  });
}

const Resolvers = {
  Person: {
    name(obj) { return obj.First_Name; },
    surname(obj) { return obj.Surname; },
    email(obj) { return obj.Email; }
  },

  Query: {
    datasetByName(_, { name }) {
      return baseDatasetQuery().select('*').where('name', '=', name)
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((e) => {
          logger.error(e.message); return null;
        });
    },

    dataset(_, { id }) {
      return result = esDatasetByID(id);
    },

    allDatasets(_, args) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return esSearchResults(args, 'dataset');
    },

    allAnnotations(_, args) {
      return esSearchResults(args, 'annotation');
    },

    countDatasets(_, args) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return esCountResults(args, 'dataset');
    },

    countAnnotations(_, args) {
      return esCountResults(args, 'annotation');
    },

    annotation(_, { id }) {
      return esAnnotationByID(id);
    },

    metadataSuggestions(_, { field, query, limit }) {
      let f = new SubstringMatchFilter(field, {}),
          q = pg.select(pg.raw(f.pgField + " as field")).select().from('dataset')
                .groupBy('field').orderByRaw('count(*) desc').limit(limit);
      return f.pgFilter(q, query).orderBy('field', 'asc')
              .then(results => results.map(row => row['field']));
    },

    peopleSuggestions(_, { role, query }) {
      const schemaPath = 'Submitted_By.' + (role == 'PI' ? 'Principal_Investigator' : 'Submitter');
      const p1 = schemaPath + '.First_Name',
            p2 = schemaPath + '.Surname',
            f1 = getPgField(p1),
            f2 = getPgField(p2);
      const q = pg.distinct(pg.raw(`${f1} as name, ${f2} as surname`)).select().from('dataset')
                  .whereRaw(`${f1} ILIKE ? OR ${f2} ILIKE ?`, ['%' + query + '%', '%' + query + '%']);
      logger.info(q.toString());
      return q.orderBy('name', 'asc').orderBy('surname', 'asc')
              .then(results => results.map(r => ({First_Name: r.name, Surname: r.surname, Email: ''})))
    },

    molecularDatabases(_, args) {
      const host = config.services.moldb_service_host;
      return fetch(`http://${host}/v1/databases`)
        .then(res => res.json())
        .then(body => body['data'])
        .catch((e) => { logger.error(e); return null; })
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

    configJson(ds) {
      return JSON.stringify(ds._source.ds_config);
    },

    metadataJson(ds) {
      return JSON.stringify(ds._source.ds_meta);
    },

    institution(ds) { return dsField(ds, 'institution'); },
    organism(ds) { return dsField(ds, 'organism'); },
    organismPart(ds) { return dsField(ds, 'organismPart'); },
    condition(ds) { return dsField(ds, 'condition'); },
    polarity(ds) { return dsField(ds, 'polarity').toUpperCase(); },
    ionisationSource(ds) { return dsField(ds, 'ionisationSource'); },
    maldiMatrix(ds) { return dsField(ds, 'maldiMatrix'); },

    submitter(ds) {
      return ds._source.ds_meta.Submitted_By.Submitter;
    },

    principalInvestigator(ds) {
      return ds._source.ds_meta.Submitted_By.Principal_Investigator;
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
      for (var i = 0; i < names.length; i++) {
        let id = ids[i];
        let infoURL;
        if (hit._source.db_name == 'HMDB') {
          infoURL = `http://www.hmdb.ca/metabolites/${id}`;
        } else if (hit._source.db_name == 'ChEBI') {
          infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
        } else if (hit._source.db_name == 'SwissLipids') {
          infoURL = `http://swisslipids.org/#/entity/${id}`;
        } else if (hit._source.db_name == 'LIPID_MAPS') {
          infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
        }

        compounds.push({
          name: names[i],
          imageURL: `http://${config.services.mol_image_server_host}/mol-images/${hit._source.db_name}/${id}.svg`,
          information: [{database: hit._source.db_name, url: infoURL}]
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
          url: config.img_upload.img_base_path + iso_image_ids[i],
          mz: parseFloat(mz),
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i]
        }
      });
    }
  },

  Mutation: {
    submitDataset(_, args) {
      const {name, path, metadataJson, datasetId} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);

        const metadata = JSON.parse(metadataJson);
        const body = JSON.stringify({
          id: datasetId,
          name: name,
          input_path: path,
          metadata: metadata,
          config: generateProcessingConfig(metadata)
        });

        const url = `http://${config.services.sm_engine_api_host}/datasets/add`;
        return fetch(url, {
             method: 'POST',
             body: body,
             headers: {
                "Content-Type": "application/json"
             }})
          .then(() => "success")
          .catch(e => {
            logger.error(`${e.message}\n`);
            return e.message
          });
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    resubmitDataset(_, args) {
      const {datasetId} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);

        return checkPermissions(datasetId, payload)
          .then(() => {
            return pg.select().from('dataset').where('id', '=', datasetId)
              .then(records => {
                const ds = records[0];
                const body = JSON.stringify({
                  id: ds.id,
                  name: ds.name,
                  input_path: ds.input_path,
                  metadata: ds.metadata,
                  config: ds.config
                });

                const url = `http://${config.services.sm_engine_api_host}/datasets/add`;
                return fetch(url, { method: 'POST', body: body, headers: {
                  "Content-Type": "application/json"
                }});
              });
          })
          .then(() => "success")
          .catch(e => {
            logger.error(`${e.stack}\n`);
            return e.message;
          });
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    updateMetadata(_, args) {
      const {datasetId, metadataJson} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        const newMetadata = JSON.parse(metadataJson);
        const user = payload.name || payload.email;

        return checkPermissions(datasetId, payload)
          .then(() => {
            const body = JSON.stringify({
              metadata: newMetadata,
              config: generateProcessingConfig(newMetadata),
              name: newMetadata.metaspace_options.Dataset_Name || ""
            });

            return pg.select().from('dataset').where('id', '=', datasetId)
              .then(records => {
                const oldMetadata = records[0].metadata;
                metadataChangeSlackNotify(user, datasetId, oldMetadata, newMetadata);
              })
              .then(() => {
                // perform ES re-indexing in the background
                const url = `http://${config.services.sm_engine_api_host}/datasets/${datasetId}/update`;
                fetch(url, { method: 'POST', body: body, headers: {
                    "Content-Type": "application/json"
                  }})
                  .catch( e => {
                    logger.error(`metadata update error: ${e.message}\n${e.stack}`);
                    metadataUpdateFailedSlackNotify(user, datasetId, e.message);
                  });
              })
              .then(() => "success");
          })
          .catch(e => {
            logger.error(e.message);
            return e.message;
          });
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    deleteDataset(_, args) {
      const {datasetId, delRawData} = args;

      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        return checkPermissions(datasetId, payload)
          .then( () => {
            const url = `http://${config.services.sm_engine_api_host}/datasets/${datasetId}/delete`;
            let body = JSON.stringify({});
            // if (delRawData != undefined || delRawData == false)
            //   body = JSON.stringify({});
            // else
            //   body = JSON.stringify({ "del_raw": true });
            return fetch(url, {method: "POST", body: body, headers: {
                    "Content-Type": "application/json"
            }});
          })
          .then(res => res.statusText)
          .catch(e => {
            logger.error(e.message);
            return e.message
          });
      } catch (e) {
        logger.error(e.message);
        return e.message;
      }
    }
  },

  Subscription: {
    datasetStatusUpdated: {
      subscribe: () => pubsub.asyncIterator('datasetStatusUpdated'),
      resolve: payload => { return payload; }
    },

    datasetDeleted: {
      subscribe: () => pubsub.asyncIterator('datasetDeleted'),
      resolve: payload => { return payload; }
    }
  }
};

module.exports = Resolvers;
