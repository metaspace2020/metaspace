const sprintf = require('sprintf-js'),
  fetch = require('node-fetch'),
  jwt = require('jwt-simple'),
  {UserError} = require('graphql-errors');

const config = require('config'),
  {esSearchResults, esCountResults, esCountGroupedResults,
   esAnnotationByID, esDatasetByID} = require('./esConnector'),
  {datasetFilters, dsField, getPgField, SubstringMatchFilter} = require('./datasetFilters.js'),
  {generateProcessingConfig, metadataChangeSlackNotify,
    metadataUpdateFailedSlackNotify, logger, pubsub, pg} = require("./utils.js");

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

function checkFetchRes(resp) {
  if (resp.ok) {
    return resp
  } else {
    throw new Error(`An error occurred during fetch request - status ${resp.status}`);
  }
}

const Resolvers = {
  Person: {
    name(obj) { return obj.First_Name; },
    surname(obj) { return obj.Surname; },
    email(obj) { return obj.Email; }
  },

  Query: {
    dataset(_, { id }) {
      return esDatasetByID(id);
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

    countDatasetsPerGroup(_, {query}) {
      const args = {
        datasetFilter: query.filter,
        simpleQuery: query.simpleQuery,
        filter: {},
        groupingFields: query.fields
      };
      return esCountGroupedResults(args, 'dataset');
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
        .then((body) => {
          let mol_dbs = body['data'];
          logger.debug(`Molecular databases: ` + JSON.stringify(mol_dbs));
          return mol_dbs;
        })
        .catch((e) => { logger.error(e); return null; })
    },

    opticalImageUrl(_, {datasetId, zoom}) {
      const intZoom = zoom <= 1.5 ? 1 : (zoom <= 3 ? 2 : (zoom <= 6 ? 4 : 8));
      return pg.select().from('optical_image')
          .where('ds_id', '=', datasetId)
          .where('zoom', '=', intZoom)
          .then(records => {
              if (records.length > 0)
                  return '/optical_images/' + records[0].id;
              else
                  return null;
          })
          .catch((e) => {
              logger.error(e);
          })
    },

    rawOpticalImage(_, {datasetId}) {
      return pg.select().from('dataset')
        .where('id', '=', datasetId)
        .then(records => {
          if (records.length > 0)
            return {
              url: '/raw_optical_images/' + records[0].optical_image,
              transform: records[0].transform
            };
          else
            return null;
        })
        .catch((e) => {
          logger.error(e);
        })
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
    growthConditions(ds) { return dsField(ds, 'growthConditions'); },
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
    },

    uploadDateTime(ds) {
      return ds._source.ds_upload_dt;
    },

    fdrCounts(ds, {inpFdrLvls}) {
      let outFdrLvls = [], outFdrCounts = [];
      if(ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
        let inpAllLvlCounts = ds._source.annotation_counts[0].counts;
        inpFdrLvls.forEach(lvl => {
          let findRes = inpAllLvlCounts.find(lvlCount => {
            return lvlCount.level === lvl
          });
          if (findRes) {
            outFdrLvls.push(findRes.level);
            outFdrCounts.push(findRes.n);
          }
        });
      }
      return {
        'levels': outFdrLvls,
        'counts': outFdrCounts
      }
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
          information: [{database: hit._source.db_name, url: infoURL, databaseId: id}]
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
          url: iso_image_ids[i] !== null ? config.img_upload.categories.iso_image.path + iso_image_ids[i] : null,
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
      const {name, path, metadataJson, datasetId, delFirst, priority, sync} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);

        const metadata = JSON.parse(metadataJson);
        const body = JSON.stringify({
          id: datasetId,
          name: name,
          input_path: path,
          metadata: metadata,
          config: generateProcessingConfig(metadata),
          priority: priority,
          del_first: delFirst
        });

        const url = `http://${config.services.sm_engine_api_host}/v1/datasets/add`;
        let smAPIPromise = fetch(url, {
             method: 'POST',
             body: body,
             headers: {
                "Content-Type": "application/json"
             }})
          .then(() => {
            logger.info(`submitDataset success: ${datasetId} ${name}`);
            return "success"
          })
          .catch(e => {
            logger.error(`submitDataset error: ${e.message}\n`);
            return e.message
          });
        if (sync)
          return smAPIPromise;
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    resubmitDataset(_, args) {
      const {datasetId, priority, sync} = args;
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
                  config: ds.config,
                  priority: priority,
                  del_first: true
                });

                const url = `http://${config.services.sm_engine_api_host}/v1/datasets/add`;
                let smAPIPromise = fetch(url, { method: 'POST', body: body, headers: {
                  "Content-Type": "application/json"}})
                  .then(() => {
                    logger.info(`resubmitDataset success: ${ds.id} ${ds.name}`);
                    return "success";
                  })
                  .catch(e => {
                    logger.error(`resubmitDataset error: ${e.message}\n`);
                    return e.message
                  });
                if (sync)
                  return smAPIPromise;
              });
          })
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    updateMetadata(_, args) {
      const {datasetId, metadataJson, priority, sync} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        const newMetadata = JSON.parse(metadataJson);
        const user = payload.name || payload.email;

        return checkPermissions(datasetId, payload)
          .then(() => {
            const body = JSON.stringify({
              metadata: newMetadata,
              config: generateProcessingConfig(newMetadata),
              name: newMetadata.metaspace_options.Dataset_Name || "",
              priority: priority
            });

            return pg.select().from('dataset').where('id', '=', datasetId)
              .then(records => {
                const oldMetadata = records[0].metadata;
                metadataChangeSlackNotify(user, datasetId, oldMetadata, newMetadata);
              })
              .then(() => {
                const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/update`;
                let smAPIPromise = fetch(url, { method: 'POST', body: body, headers: {
                    "Content-Type": "application/json"
                  }})
                  .then(() => {
                    logger.info(`updateMetadata success: ${datasetId}`);
                    return "success";
                  })
                  .catch( e => {
                    logger.error(`updateMetadata error: ${e.message}\n${e.stack}`);
                    metadataUpdateFailedSlackNotify(user, datasetId, e.message);
                  });
                if (sync)
                  return smAPIPromise;
              })
          })
      } catch (e) {
        logger.error(e);
        return e.message;
      }
    },

    deleteDataset(_, args) {
      const {datasetId, delRawData, sync} = args;

      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        return checkPermissions(datasetId, payload)
          .then( () => {
            const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/delete`;
            let body = JSON.stringify({});
            // if (delRawData != undefined || delRawData == false)
            //   body = JSON.stringify({});
            // else
            //   body = JSON.stringify({ "del_raw": true });
            let smAPIPromise = fetch(url, {method: "POST", body: body, headers: {
                "Content-Type": "application/json"
              }})
              .catch( e => {
                logger.error(`deleteDataset error: ${e.message}\n${e.stack}`);
              });
            if (sync)
              return smAPIPromise;
          })
          .then(res => {
            logger.info(`deleteDataset success: ${datasetId}`);
            return "success";
          })
      } catch (e) {
        logger.error(e.message);
        return e.message;
      }
    },

    async addOpticalImage(_, {input}) {
      let {datasetId, imageUrl, transform} = input;
      const basePath = `http://localhost:${config.img_storage_port}`;
      if (imageUrl[0] == '/') {
        // imageUrl comes from the web application and should not include host/port.
        //
        // This is necessary for a Virtualbox installation because of port mapping,
        // and preferred for AWS installation because we're not charged for downloads
        // if internal network is used.
        //
        // TODO support image storage running on a separate host
        imageUrl = basePath + imageUrl;
      }
      const payload = jwt.decode(input.jwt, config.jwt.secret);
      try {
        await checkPermissions(datasetId, payload);
        const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/add-optical-image`;
        const body = {url: imageUrl, transform};
        let processOptImage = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {'Content-Type': 'application/json'}});
        checkFetchRes(processOptImage);
        return 'success';
      } catch (e) {
        logger.error(e.message);
        return e.message;
      }
    },

    async deleteOpticalImage(_, args) {
      let {datasetId} = args;
      const payload = jwt.decode(args.jwt, config.jwt.secret);
      const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/del-optical-image`;
      try {
        await checkPermissions(datasetId, payload);
        let dbDelFetch = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({datasetId}),
          headers: {'Content-Type': 'application/json'}});
        checkFetchRes(dbDelFetch);
        return 'success';
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
