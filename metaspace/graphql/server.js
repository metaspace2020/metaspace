import express from 'express';

import pgp from 'pg-promise';
import elasticsearch from 'elasticsearch';

import { makeExecutableSchema } from 'graphql-tools';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import bodyParser from 'body-parser';

import sprintf from 'sprintf-js'
import capitalize from 'lodash/capitalize'

import { readFile } from 'fs';
import smEngineConfig from './config.json';

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

const esIndex = smEngineConfig.elasticsearch.index;

var db = pgp()(dbConfig());
var es = new elasticsearch.Client(esConfig());

function esFormatMz(mz) {
  // according to sm.engine.es_export
  return sprintf.sprintf("%010.4f", mz);
}

function constructAnnotationQuery(args) {
  const { orderBy, offset, limit, database } = args;
  const order = orderBy == 'ORDER_BY_MSM' ? 'desc' : 'asc';
  const sortField = orderBy == 'ORDER_BY_MSM' ? 'msm' : 'mz';

  var body = {
    query: {
      constant_score: {
        filter: {bool: {must: [
          {term: {db_name: database}}]}}
      }
    },
    sort: [{[sortField]: order}]
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

  if (args.datasetId !== undefined)
    addFilter({term: {ds_id: args.datasetId}});

  if (args.mzFilter !== undefined)
    addRangeFilter('mz', {min: esFormatMz(args.mzFilter.min),
                          max: esFormatMz(args.mzFilter.max)});

  if (args.msmScoreFilter !== undefined)
    addRangeFilter('msm', args.msmScoreFilter);

  if (args.fdrLevel !== undefined)
    addRangeFilter('fdr', {min: 0, max: args.fdrLevel});

  if (args.sumFormula !== undefined)
    addFilter({term: {sf: args.sumFormula}});

  if (args.adduct !== undefined)
    addFilter({term: {adduct: args.adduct}});

  if (args.datasetNamePrefix !== undefined)
    addFilter({prefix: {ds_name: args.datasetNamePrefix}});

  if (args.compoundNameContains !== undefined)
    addFilter({wildcard: {comp_names: '*' + args.compoundNameContains + '*'}});

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
  return es.search(request).then((resp) => {
    return resp.hits.hits.map((hit) => hit._source)
  }).catch((err) => {
    console.log(err);
    return [];
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
      return db.any("select * from dataset where name = $1", [name])
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((err) => {
          console.log(err); return null;
        });
    },

    dataset(_, { id }) {
      return db.any("select * from dataset where id = $1", [id])
        .then((data) => {
          return data.length > 0 ? data[0] : null;
        })
        .catch((err) => {
          console.log(err); return null;
        });
    },

    allDatasets(_, {offset, limit}) {
      return db.any("select * from dataset order by name offset $1 limit $2",
                    [offset, limit])
        .catch((err) => { console.log(err); return []; });
    },

    allAnnotations(_, args) {
      return esSearchResults(args);
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
    institution(ds) {
      return ds.metadata.Submitted_By.Institution;
    },

    submitter(ds) {
      return ds.metadata.Submitted_By.Submitter;
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

    analyzer(ds) {
      const msInfo = ds.metadata.MS_Analysis;
      return {
        'type': msInfo.Analyzer,
        'rp': msInfo.Detector_Resolving_Power
      };
    },

    annotations(ds, args) {
      args.datasetId = ds.id;
      return esSearchResults(args);
    }
  },

  Annotation: {
    sumFormula(hit) {
      return hit.sf;
    },

    possibleCompounds(hit) {
      return hit.comp_names.split('|').map((n) => ({name: n}));
    },

    mz(hit) {
      return parseFloat(hit.mz);
    },

    fdrLevel(hit) {
      return hit.fdr;
    },

    msmScore(hit) {
      return hit.msm
    },

    dataset(hit) {
      return {
        id: hit.ds_id,
        name: hit.ds_name,
        metadata: hit.ds_meta
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

  app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }))
  app.use('/graphiql', graphiqlExpress({
    endpointURL: '/graphql'
  }));

  app.listen(PORT);
})
