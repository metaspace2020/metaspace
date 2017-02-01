const express = require('express'),
      knex = require('knex'),
      pgp = require('pg-promise'),
      elasticsearch = require('elasticsearch'),
      bodyParser = require('body-parser'),
      cors = require('cors'),
      compression = require('compression'),
      sprintf = require('sprintf-js'),
      capitalize = require('lodash/capitalize'),
      fetch = require('node-fetch'),
      readFile = require('fs').readFile,
      smEngineConfig = require('./config.json'),
      makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
      graphqlExpress = require('graphql-server-express').graphqlExpress,
      graphiqlExpress = require('graphql-server-express').graphiqlExpress;

const dbConfig = () => {
  const {host, database, user, password} = smEngineConfig.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

const esConfig = () => {
  return {
    hosts: [smEngineConfig.elasticsearch.host],
    apiVersion: '2.4'
  }
};

const MOL_IMAGE_SERVER_IP = "52.51.114.30:3020";

const esIndex = smEngineConfig.elasticsearch.index;

var pg = require('knex')({
  client: 'pg',
  connection: dbConfig(),
  searchPath: 'knex,public'
});

var db = pgp()(dbConfig());
var es = new elasticsearch.Client(esConfig());

function esFormatMz(mz) {
  // transform m/z into a string according to sm.engine.es_export
  return sprintf.sprintf("%010.4f", mz);
}

function esSort(orderBy, sortingOrder) {
  let order = 'asc';
  if (sortingOrder == 'DESCENDING')
    order = 'desc';
  else if (orderBy == 'ORDER_BY_MSM')
    order = 'desc';

  if (orderBy == 'ORDER_BY_MZ')
    return [{'mz': order}];
  else if (orderBy == 'ORDER_BY_MSM')
    return [{'msm': order}];
  else if (orderBy == 'ORDER_BY_FDR_MSM')
    return [{'fdr': order}, {'msm': order == 'asc' ? 'desc' : 'asc'}];
}

class DatasetFilter {
  constructor(options) {
    this.options = options;
  }

  esFilter(value) {
    const field = 'ds_meta.' + this.options.schemaPath;
    if (this.options.preprocess)
      value = this.options.preprocess(value);
    if (this.options.match == 'exact')
      return {term: {[field]: value}}
    else
      return {wildcard: {[field]: `*${value}*`}}
  } 

  pgFilter(q, value) {
    if (this.options.preprocess)
      value = this.options.preprocess(value);
    const pathElements = this.options.schemaPath.replace(/\./g, ',');
    const obj = "metadata#>>'{" + pathElements + "}'";

    if (this.options.match == 'exact')
      return q.whereRaw(obj + ' = ?', [value]);
    else
      return q.whereRaw(obj + ' LIKE ?', ['%' + value + '%']);
  }
}

class PhraseMatchFilter extends DatasetFilter {
  constructor(options) { super(options); }

  esFilter(value) {
    const field = 'ds_meta.' + this.options.schemaPath;
    if (this.options.preprocess)
      value = this.options.preprocess(value);
    return {match: {[field]: {query: value, type: 'phrase'}}}
  }
}

const datasetFilters = {
  institution: new DatasetFilter({
    schemaPath: 'Submitted_By.Institution',
    match: 'exact',
  }),

  polarity: new PhraseMatchFilter({
    schemaPath: 'MS_Analysis.Polarity',
    match: 'exact',
    preprocess: capitalize
  }),

  ionisationSource: new PhraseMatchFilter({
    schemaPath: 'MS_Analysis.Ionisation_Source',
    match: 'exact',
  }),

  analyzerType: new DatasetFilter({
    schemaPath: 'MS_Analysis.Analyzer',
    match: 'exact'
  }),

  organism: new DatasetFilter({
    schemaPath: 'Sample_Information.Organism',
    match: 'exact'
  }),

  maldiMatrix: new DatasetFilter({
    schemaPath: 'Sample_Preparation.MALDI_Matrix',
    match: 'exact'
  })
}

function constructAnnotationQuery(args) {
  const { orderBy, sortingOrder, offset, limit, filter, datasetFilter } = args;
  const { database, datasetId, datasetNamePrefix, mzFilter, msmScoreFilter,
          fdrLevel, sumFormula, adduct, compoundQuery } = filter;

  var body = {
    query: {
      constant_score: {
        filter: {bool: {must: [
          {term: {db_name: database}}]}}
      }
    },
    sort: esSort(orderBy, sortingOrder)
  };

  function addFilter(filter) {
    body.query.constant_score.filter.bool.must.push(filter);
  }

  function addRangeFilter(field, interval) {
    const filter = {range: {}};
    filter.range[field] = {
      gte: interval.min,
      lt: interval.max
    };
    addFilter(filter);
  }

  if (datasetId)
    addFilter({term: {ds_id: datasetId}});

  if (mzFilter)
    addRangeFilter('mz', {min: esFormatMz(mzFilter.min),
                          max: esFormatMz(mzFilter.max)});

  if (msmScoreFilter)
    addRangeFilter('msm', msmScoreFilter);

  if (fdrLevel)
    addRangeFilter('fdr', {min: 0, max: fdrLevel + 1e-3});

  if (sumFormula)
    addFilter({term: {sf: sumFormula}});

  if (typeof adduct === 'string')
    addFilter({term: {adduct: adduct}});

  if (datasetNamePrefix)
    addFilter({prefix: {ds_name: datasetNamePrefix}});

  if (compoundQuery)
      addFilter({or: [
        { wildcard: {comp_names: `*${compoundQuery}*`}},
        { term: {sf: compoundQuery }}]});

  for (var key in datasetFilters) {
    const val = datasetFilter[key];
    if (val)
      addFilter(datasetFilters[key].esFilter(val));
  }

  return body;
}

function esSearchResults(args) {
  const body = constructAnnotationQuery(args);
  const request = {
    body,
    index: esIndex,
    from: args.offset,
    size: args.limit
  };
  console.log(JSON.stringify(body));
  console.time('esQuery');
  return es.search(request).then((resp) => {
    console.timeEnd('esQuery');
    return resp.hits.hits.map((hit) => hit._source)
  }).catch((err) => {
    console.log(err);
    return [];
  });
}

function esCountResults(args) {
  const body = constructAnnotationQuery(args);
  const request = { body, index: esIndex };
  return es.count(request).then((resp) => {
    return resp.count;
  }).catch((err) => {
    console.log(err);
    return 0;
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
      return pg.select().from('dataset').where('name', '=', name)
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((err) => {
          console.log(err); return null;
        });
    },

    dataset(_, { id }) {
      return pg.select().from('dataset').where('id', '=', id)
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((err) => {
          console.log(err); return null;
        });
    },

    allDatasets(_, {orderBy, sortingOrder, offset, limit, filter}) {
      let q = pg.select().from('dataset');

      console.log(JSON.stringify(filter));

      if (filter.name)
        q = q.where("name", "=", filter.name);

      for (var key in datasetFilters) {
        const val = filter[key];
        if (val)
          q = datasetFilters[key].pgFilter(q, val);
      }

      const orderVar = orderBy == 'ORDER_BY_NAME' ? 'name' : 'id';
      const ord = sortingOrder == 'ASCENDING' ? 'asc' : 'desc';

      console.log(q.toString());

      return q.orderBy(orderVar, ord).offset(offset).limit(limit)
        .catch((err) => { console.log(err); return []; });
    },

    allAnnotations(_, args) {
      return esSearchResults(args);
    },

    countAnnotations(_, args) {
      return esCountResults(args);
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
    metadataJson(ds) {
      return JSON.stringify(ds.metadata);
    },

    institution(ds) {
      return ds.metadata.Submitted_By.Institution;
    },

    submitter(ds) {
      return ds.metadata.Submitted_By.Submitter;
    },

    organism(ds) {
      return ds.metadata.Sample_Information.Organism;
    },

    principalInvestigator(ds) {
      return ds.metadata.Submitted_By.Principal_Investigator;
    },

    polarity(ds) {
      return ds.metadata.MS_Analysis.Polarity.toUpperCase();
    },

    ionisationSource(ds) {
      return ds.metadata.MS_Analysis.Ionisation_Source;
    },

    maldiMatrix(ds) {
      return ds.metadata.Sample_Preparation.MALDI_Matrix;
    },

    analyzer(ds) {
      const msInfo = ds.metadata.MS_Analysis;
      return {
        'type': msInfo.Analyzer,
        'rp': msInfo.Detector_Resolving_Power
      };
    },

    /* annotations(ds, args) {
       args.datasetId = ds.id;
       return esSearchResults(args);
       } */
  },

  Annotation: {
    sumFormula(hit) {
      return hit.sf;
    },

    possibleCompounds(hit) {
      const ids = hit.comp_ids.split('|');
      const names = hit.comp_names.split('|');
      let compounds = [];
      for (var i = 0; i < names.length; i++) {
        let id = ids[i];
        let infoURL;
        if (hit.db_name == 'HMDB') {
          id = sprintf.sprintf("HMDB%05d", id);
          infoURL = `http://www.hmdb.ca/metabolites/${id}`;
        } else if (hit.db_name == 'ChEBI') {
          id = "CHEBI:" + id;
          infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
        } else if (hit.db_name == 'SwissLipids') {
          id = sprintf.sprintf("SLM:%09d", id);
          infoURL = `http://swisslipids.org/#/entity/${id}`;
        } else if (hit.db_name == 'LIPID_MAPS') {
          infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
        }

        compounds.push({
          name: names[i],
          imageURL: `http://${MOL_IMAGE_SERVER_IP}/mol-images/${hit.db_name}/${id}.svg`,
          information: [{database: hit.db_name, url: infoURL}]
        });
      }
      return compounds;
    },

    mz: (hit) => parseFloat(hit.mz),

    fdrLevel: (hit) => hit.fdr,

    msmScore: (hit) => hit.msm,

    rhoSpatial: (hit) => hit.image_corr,

    rhoSpectral: (hit) => hit.pattern_match,

    rhoChaos: (hit) => hit.chaos,

    dataset(hit) {
      return {
        id: hit.ds_id,
        name: hit.ds_name,
        metadata: hit.ds_meta
      }
    },

    ionImage({ mz, db_id, ds_id, job_id, sf_id, sf, adduct }) {
      return {
        mz,
        url:`http://alpha.metasp.eu/mzimage2/${db_id}/${ds_id}/${job_id}/${sf_id}/${sf}/${adduct}`
      };
    },

    isotopeImages({ mz, db_id, ds_id, job_id, sf_id, sf, adduct }) {
      return fetch(`http://alpha.metasp.eu/sf_peak_mzs/${ds_id}/${db_id}/${sf_id}/${adduct}`)
          .then(res => res.json())
          .then(function(centroids) {
            let images = [];
            for (let i = 0; i < 4; i++)
              images.push({
                mz: centroids[i],
                url:`http://alpha.metasp.eu/mzimage2/${db_id}/${ds_id}/${job_id}/${sf_id}/${sf}/${adduct}/${i}`
              });
            return images;
          });
    }
  }
}

const logger = { log: (e) => console.log(e) };

const PORT = 3010;

var app = express();

readFile('schema.graphql', 'utf8', (err, contents) => {
  const schema = makeExecutableSchema({
    typeDefs: contents,
    resolvers: Resolvers,
    logger
  })

  app.use(cors());
  app.use(compression());
  app.use('/graphql', bodyParser.json({ type: '*/*' }), graphqlExpress({ schema }))
  app.use('/graphiql', graphiqlExpress({
    endpointURL: '/graphql'
  }));

  app.listen(PORT);
})
