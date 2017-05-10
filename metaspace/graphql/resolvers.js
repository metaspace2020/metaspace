/**
 * Created by intsco on 1/11/17.
 */

const sprintf = require('sprintf-js'),
  fetch = require('node-fetch'),
  jwt = require('jwt-simple'),
  {UserError} = require('graphql-errors');

const config = require('./config'),
  {esSearchResults, esCountResults, esAnnotationByID} = require('./esConnector'),
  {datasetFilters, dsField, SubstringMatchFilter} = require('./datasetFilters.js'),
  {generateProcessingConfig, metadataChangeSlackNotify, logger} = require("./utils.js");

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
                pg.raw('array_agg(status) as status'),
                'metadata', 'config')
        .from('dataset').leftOuterJoin('job', 'dataset.id', 'job.ds_id')
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
        .catch((err) => {
          logger.error(err); return null;
        });
    },

    dataset(_, { id }) {
      return baseDatasetQuery().select('*').where('id', '=', id)
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((err) => {
          logger.error(err); return null;
        });
    },

    allDatasets(_, {orderBy, sortingOrder, offset, limit, filter}) {
      let q = baseDatasetQuery();
      logger.info(JSON.stringify(filter));

      for (let key in datasetFilters) {
        const val = filter[key];
        if (val)
          q = datasetFilters[key].pgFilter(q, val);
      }

      const orderVar = orderBy == 'ORDER_BY_NAME' ? 'name' : 'last_finished';
      const ord = sortingOrder == 'ASCENDING' ? 'asc' : 'desc';
  
      logger.info(q.toString());
      console.time('pgQuery');

      return q.orderBy(orderVar, ord).offset(offset).limit(limit).select('*')
        .then(result => { console.timeEnd('pgQuery'); return result; })
        .catch((e) => { logger.error(e); return []; });
    },

    allAnnotations(_, args) {
      return esSearchResults(args);
    },

    countDatasets(_, {filter}) {
      let q = baseDatasetQuery();
      for (var key in datasetFilters) {
        const val = filter[key];
        if (val)
          q = datasetFilters[key].pgFilter(q, val);
      }
      return q.count('id')
              .then(result => parseInt(result[0].count))
              .catch((e) => { logger.error(e); return 0; });
    },

    countAnnotations(_, args) {
      return esCountResults(args);
    },

    annotation(_, { id }) {
      return esAnnotationByID(id);
    },

    metadataSuggestions(_, { field, query }) {
      let f = new SubstringMatchFilter(field, {}),
          q = pg.distinct(pg.raw(f.pgField + " as field")).select().from('dataset');
      return f.pgFilter(q, query).orderBy('field', 'asc')
              .then(results => results.map(row => row['field']));
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
    configJson(ds) {
      return JSON.stringify(ds.config);
    },

    metadataJson(ds) {
      return JSON.stringify(ds.metadata);
    },

    institution(ds) { return dsField(ds, 'institution'); },
    organism(ds) { return dsField(ds, 'organism'); },
    organismPart(ds) { return dsField(ds, 'organismPart'); },
    condition(ds) { return dsField(ds, 'condition'); },
    polarity(ds) { return dsField(ds, 'polarity').toUpperCase(); },
    ionisationSource(ds) { return dsField(ds, 'ionisationSource'); },
    maldiMatrix(ds) { return dsField(ds, 'maldiMatrix'); },

    submitter(ds) {
      return ds.metadata.Submitted_By.Submitter;
    },

    principalInvestigator(ds) {
      return ds.metadata.Submitted_By.Principal_Investigator;
    },

    analyzer(ds) {
      const msInfo = ds.metadata.MS_Analysis;
      return {
        'type': msInfo.Analyzer,
        'rp': msInfo.Detector_Resolving_Power
      };
    },

    status(ds) {
      if (ds.status === undefined)
        return null; // ES records
      if (ds.status.indexOf('STARTED') >= 0)
        return 'STARTED';
      if (ds.status.indexOf(null) >= 0)
        return 'QUEUED';
      if (ds.status.indexOf('FAILED') >= 0)
        return 'FAILED';
      return 'FINISHED';
    }

    /* annotations(ds, args) {
     args.datasetId = ds.id;
     return esSearchResults(args);
     } */
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
      return {
        id: hit._source.ds_id,
        name: hit._source.ds_name,
        metadata: hit._source.ds_meta
      }
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
      const {iso_image_urls, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints} = hit._source;
      return iso_image_urls.map((url, i) => ({
        url,
        mz: parseFloat(centroid_mzs[i]),
        totalIntensity: total_iso_ints[i],
        minIntensity: min_iso_ints[i],
        maxIntensity: max_iso_ints[i]
      }));
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
        return fetch(url, { method: 'POST', body: body })
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

    updateMetadata(_, args) {
      const {datasetId, metadataJson} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        const newMetadata = JSON.parse(metadataJson);

        return checkPermissions(datasetId, payload)
          .then(() => {
            const body = JSON.stringify({
              metadata: newMetadata,
              config: generateProcessingConfig(newMetadata),
              name: newMetadata.metaspace_options.Dataset_Name || ""
            });

            // perform ES re-indexing in the background
            const url = `http://${config.services.sm_engine_api_host}/datasets/${datasetId}/update`;
            fetch(url, { method: 'POST', body: body })
              .catch(e => logger.error(`metadata update error: ${e.message}\n${e.stack}`));

            return pg.select().from('dataset').where('id', '=', datasetId)
              .then(records => {
                const oldMetadata = records[0].metadata;
                metadataChangeSlackNotify(payload.name, datasetId, oldMetadata, newMetadata);
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
            let body = {};
            // if (delRawData != undefined || delRawData == false)
            //   body = JSON.stringify({});
            // else
            //   body = JSON.stringify({ "del_raw": true });
            return fetch(url, {method: "POST", body: body});
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
  }
};

module.exports = Resolvers;
