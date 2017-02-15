const amqp = require('amqplib'),
      AWS = require('aws-sdk'),
      bodyParser = require('body-parser'),
      capitalize = require('lodash/capitalize'),
      cors = require('cors'),
      compression = require('compression'),
      elasticsearch = require('elasticsearch'),
      exec = require('child_process').exec,
      express = require('express'),
      fetch = require('node-fetch'),
      graphqlExpress = require('graphql-server-express').graphqlExpress,
      graphiqlExpress = require('graphql-server-express').graphiqlExpress,
      jsondiffpatch = require('jsondiffpatch'),
      jwt = require('jwt-simple'),
      knex = require('knex'),
      makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
      moment = require('moment'),
      pgp = require('pg-promise'),
      readFile = require('fs').readFile,
      slack = require('node-slack'),
      smEngineConfig = require('./config.json'),
      sprintf = require('sprintf-js'),
      utils = require('./utils.js');

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

const slackConn = new slack(smEngineConfig.slack.webhook_url);

AWS.config.update({
    accessKeyId: smEngineConfig.aws.aws_access_key_id,
    secretAccessKey: smEngineConfig.aws.aws_secret_access_key,
    region: "eu-west-1"
});

var s3 = new AWS.S3();

function copyMetadata(path, metadataJson) {
  // TODO: local storage support

  const [bucket, dir] = path.match(/s3a:\/\/([^\/]+)\/(.*)/).slice(1);
  console.log(bucket, dir);

  return s3.putObject({
    Bucket: bucket, Key: dir + '/meta.json',
    Body: new Buffer(metadataJson)
  }).promise().then(() => {
    const config = utils.generateProcessingConfig(JSON.parse(metadataJson));
    return s3.putObject({
      Bucket: bucket, Key: dir + '/config.json',
      Body: new Buffer(JSON.stringify(config, null, 2))
    }).promise();
  })
}

function sendMessageToRabbitMQ(message) {
  slackConn.send({
    text: ':email: [v] Sent: ' + message,
    username: 'webhookbot',
    channel: 'sm_daemon',
    icon_emoji: ':robot_face:'
  });

  const {host, user, password} = smEngineConfig.rabbitmq,
        queueName = 'sm_annotate',
        buf = new Buffer(message);

  return amqp.connect(`amqp://${user}:${password}@${host}`)
             .then(conn => conn.createChannel())
             .then(ch => ch.assertQueue(queueName)
                           .then(ok => ch.sendToQueue(queueName, buf)));
}

const ES_API = 'localhost:5123';
const MOL_IMAGE_SERVER_IP = "52.51.114.30:3020";

// private EC2 IP with a few endpoints that are still used
const OLD_WEBAPP_IP_PRIVATE = "172.31.47.69";

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

class AbstractDatasetFilter {
  constructor(schemaPath, options) {
    this.schemaPath = schemaPath;
    this.options = options;

    this.esField = 'ds_meta.' + this.schemaPath;

    const pathElements = this.schemaPath.replace(/\./g, ',');
    this.pgField = "metadata#>>'{" + pathElements + "}'";
  }

  preprocess(val) {
    if (this.options.preprocess)
      return this.options.preprocess(val);
    return val;
  }

  esFilter(value) {}
  pgFilter(q, value) {}
}

class ExactMatchFilter extends AbstractDatasetFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {term: {[this.esField]: this.preprocess(value)}}
  }

  pgFilter(q, value) {
    return q.whereRaw(this.pgField + ' = ?', [this.preprocess(value)]);
  }
}

class SubstringMatchFilter extends AbstractDatasetFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {wildcard: {[this.esField]: `*${this.preprocess(value)}*`}}
  }

  pgFilter(q, value) {
    return q.whereRaw(this.pgField + ' ILIKE ?', ['%' + this.preprocess(value) + '%']);
  }
}

class PhraseMatchFilter extends SubstringMatchFilter {
  constructor(schemaPath, options) {
    super(schemaPath, options);
  }

  esFilter(value) {
    return {match: {[this.esField]: {query: this.preprocess(value), type: 'phrase'}}}
  }
}

const datasetFilters = {
  institution: new ExactMatchFilter('Submitted_By.Institution', {}),
  polarity: new PhraseMatchFilter('MS_Analysis.Polarity', {preprocess: capitalize}),
  ionisationSource: new PhraseMatchFilter('MS_Analysis.Ionisation_Source', {}),
  analyzerType: new ExactMatchFilter('MS_Analysis.Analyzer', {}),
  organism: new ExactMatchFilter('Sample_Information.Organism', {}),
  maldiMatrix: new ExactMatchFilter('Sample_Preparation.MALDI_Matrix', {})
};

function dsField(pgDatasetRecord, alias) {
  let info = pgDatasetRecord.metadata;
  for (let field of datasetFilters[alias].schemaPath.split("."))
    info = info[field];
  return info;
}

function constructAnnotationQuery(args) {
  const { orderBy, sortingOrder, offset, limit, filter, datasetFilter } = args;
  const { database, datasetId, datasetName, mzFilter, msmScoreFilter,
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

  if (datasetName)
    addFilter({term: {ds_name: datasetName}});

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
    return resp.hits.hits;
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
    },

    annotation(_, { id }) {
      return es.get({index: esIndex, type: 'annotation', id})
        .then((resp) => {
          return resp;
      }).catch((err) => {
          return null;
      });
    },

    metadataSuggestions(_, { field, query }) {
      let f = new SubstringMatchFilter(field, {}),
          q = pg.distinct(pg.raw(f.pgField + " as field")).select().from('dataset');
      return f.pgFilter(q, query).then(results => results.map(row => row['field']));
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

    institution(ds) { return dsField(ds, 'institution'); },
    organism(ds) { return dsField(ds, 'organism'); },
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
      const ids = hit._source.comp_ids.split('|');
      const names = hit._source.comp_names.split('|');
      let compounds = [];
      for (var i = 0; i < names.length; i++) {
        let id = ids[i];
        let infoURL;
        if (hit._source.db_name == 'HMDB') {
          id = sprintf.sprintf("HMDB%05d", id);
          infoURL = `http://www.hmdb.ca/metabolites/${id}`;
        } else if (hit._source.db_name == 'ChEBI') {
          id = "CHEBI:" + id;
          infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
        } else if (hit._source.db_name == 'SwissLipids') {
          id = sprintf.sprintf("SLM:%09d", id);
          infoURL = `http://swisslipids.org/#/entity/${id}`;
        } else if (hit._source.db_name == 'LIPID_MAPS') {
          infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
        }

        compounds.push({
          name: names[i],
          imageURL: `http://${MOL_IMAGE_SERVER_IP}/mol-images/${hit._source.db_name}/${id}.svg`,
          information: [{database: hit._source.db_name, url: infoURL}]
        });
      }
      return compounds;
    },

    adduct: (hit) => hit._source.adduct,

    mz: (hit) => parseFloat(hit._source.mz),

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

    ionImage(hit) {
      const { mz, db_id, ds_id, job_id, sf_id, sf, adduct } = hit._source;
      return {
        mz,
        url:`http://alpha.metasp.eu/mzimage2/${db_id}/${ds_id}/${job_id}/${sf_id}/${sf}/${adduct}/0`
      };
    },

    isotopeImages(hit) {
      const { mz, db_id, ds_id, job_id, sf_id, sf, adduct } = hit._source;
      return fetch(`http://${OLD_WEBAPP_IP_PRIVATE}/sf_peak_mzs/${ds_id}/${db_id}/${sf_id}/${adduct}`)
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
    },

    // fetches data without exposing database IDs to the client
    peakChartData(hit) {
      const {ds_id, job_id, db_id, sf_id, adduct} = hit._source;
      const add = adduct == "" ? "None" : adduct;
      const url = `http://${OLD_WEBAPP_IP_PRIVATE}/spectrum_line_chart_data/${ds_id}/${job_id}/${db_id}/${sf_id}/${add}`;
      return fetch(url).then(res => res.json()).then(json => JSON.stringify(json));
    }
  },

  Mutation: {
    submitDataset(_, args) {
      const {path, metadataJson} = args;
      try {
        const metadata = JSON.parse(metadataJson);

        const message = {
          ds_name: metadata.metaspace_options.Dataset_Name,
          ds_id: moment().format("Y-MM-DD_HH[h]mm[m]ss[s]"),
          input_path: path,
          user_email: metadata.Submitted_By.Submitter.Email
        };

        copyMetadata(path, metadataJson).then(() => {
          sendMessageToRabbitMQ(JSON.stringify(message));
        });

        return "success";
      } catch (e) {
        return e.message;
      }
    },

    updateMetadata(_, args) {
      const {datasetId, metadataJson} = args;
      try {
        const newMetadata = JSON.parse(metadataJson);
        const payload = jwt.decode(args.jwt, smEngineConfig.jwt.secret);

        return pg.select().from('dataset').where('id', '=', datasetId)
          .then(records => {
            const oldMetadata = records[0].metadata,
                  datasetName = records[0].name;

            // check if the user has permissions to modify the metadata
            let allowUpdate = false;
            if (payload.role == 'admin')
              allowUpdate = true;
            else if (payload.email == oldMetadata.Submitted_By.Submitter.Email)
              allowUpdate = true;
            if (!allowUpdate)
              throw new Error("you don't have permissions to edit this dataset");

            // update the database record
            return pg('dataset').where('id', '=', datasetId).update({
              metadata: metadataJson,
              name: newMetadata.metaspace_options.Dataset_Name
            }).then(_ => ({oldMetadata, oldDatasetName: datasetName}))
          })
          .then(({oldMetadata, oldDatasetName}) => {
            // compute delta between old and new metadata
            const delta = jsondiffpatch.diff(oldMetadata, newMetadata),
                  diff = jsondiffpatch.formatters.jsonpatch.format(delta);

            // run elasticsearch reindexing in the background mode
            if (diff.length > 0) {
              fetch(`http://${ES_API}/reindex/${datasetId}`, { method: 'POST'})
                .then(resp => console.log(`reindexed ${datasetId}`))
                .catch(err => console.log(err));
            }

            // determined if reprocessing is needed
            const changedPaths = diff.map(item => item.path);
            let needsReprocessing = false;
            for (let path of changedPaths) {
              if (path.startsWith('/MS_Analysis') && path != '/MS_Analysis/Ionisation_Source')
                needsReprocessing = true;
              if (path == '/metaspace_options/Metabolite_Database')
                needsReprocessing = true;
            }

            // send a Slack notification about the change
            let msg = slackConn.send({
              text: `${payload.name} edited metadata of ${oldDatasetName} (id: ${datasetId})` +
                "\nDifferences:\n" + JSON.stringify(diff, null, 2),
              channel: smEngineConfig.slack.channel
            });

            if (needsReprocessing) {
              // TODO: send message straight to the RabbitMQ
              msg.then(() => { slackConn.send({
                text: `@vitaly please reprocess ^`, channel: smEngineConfig.slack.channel
              })});
            }
          })
          .then(() => "success");
      } catch (e) {
        return e.message;
      }
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
