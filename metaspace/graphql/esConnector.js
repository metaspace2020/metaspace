/**
 * Created by intsco on 1/11/17.
 */
const ES_LIMIT_MAX = 50000;

const elasticsearch = require('elasticsearch'),
  sprintf = require('sprintf-js');

const config = require('config'),
  {datasetFilters, dsField} = require('./datasetFilters.js');
  logger = require('./utils').logger;

const esConfig = () => {
  return {
    host: [config.elasticsearch],
    apiVersion: '5.0'
  }
};

const esIndex = config.elasticsearch.index;
const es = new elasticsearch.Client(esConfig());

function esFormatMz(mz) {
  // transform m/z into a string according to sm.engine.es_export;
  // add extra 2 digits after decimal place for search queries
  return sprintf.sprintf("%012.6f", mz);
}

function esSort(orderBy, sortingOrder) {
  // default order
  let order = 'asc';
  if (orderBy == 'ORDER_BY_MSM' || orderBy == 'ORDER_BY_DATE')
    order = 'desc';

  if (sortingOrder == 'DESCENDING')
    order = 'desc';
  else if (sortingOrder == 'ASCENDING')
    order = 'asc';

  // annotation orderings
  if (orderBy == 'ORDER_BY_MZ')
    return [{'mz': order}];
  else if (orderBy == 'ORDER_BY_MSM')
    return [{'msm': order}];
  else if (orderBy == 'ORDER_BY_FDR_MSM')
    return [{'fdr': order}, {'msm': order == 'asc' ? 'desc' : 'asc'}];
  else if (orderBy == 'ORDER_BY_DATASET')
    return [{'ds_name': order}, {'mz': order}];
  else if (orderBy == 'ORDER_BY_FORMULA')
    return [{'sf': order}, {'adduct': order}, {'fdr': order}];
  // dataset orderings
  else if (orderBy == 'ORDER_BY_DATE')
    return [{'ds_last_finished': order}];
  else if (orderBy == 'ORDER_BY_NAME')
    return [{'ds_name': order}];
}

// consider renaming the function as it handles not only annotations but datasets as well
function constructAnnotationQuery(args, docType) {
  const { orderBy, sortingOrder, offset, limit, filter, datasetFilter, simpleQuery } = args;
  const { database, datasetName, mzFilter, msmScoreFilter,
    fdrLevel, sumFormula, adduct, compoundQuery } = filter;

  var body = {
    query: {
      bool: {
        filter: []
      }
    }
  };

  if (orderBy)
    body.sort = esSort(orderBy, sortingOrder);

  if (database) {
    addFilter({term: {db_name: database}});
  }

  function addFilter(filter) {
    body.query.bool.filter.push(filter);
  }

  function addRangeFilter(field, interval) {
    const filter = {range: {}};
    filter.range[field] = {
      gte: interval.min,
      lt: interval.max
    };
    addFilter(filter);
  }

  addFilter({term: {_type: docType}});

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
    addFilter({bool: {should: [
      { wildcard: {comp_names: `*${compoundQuery.toLowerCase()}*`}},
      { term: {sf: compoundQuery }}]}});

  if (simpleQuery)
    addFilter({simple_query_string: {
      query: simpleQuery, fields: ["_all"], default_operator: "and"
   }});

  for (var key in datasetFilters) {
    const val = datasetFilter[key];
    if (val) {
      const f = datasetFilters[key].esFilter(val);
      if (Array.isArray(f))
        for (let x of f)
          addFilter(x);
      else
        addFilter(f);
    }
  }

  return body;
}

module.exports.esSearchResults = function(args, docType) {
  if (args.limit > ES_LIMIT_MAX) {
    return Error(`The maximum value for limit is ${ES_LIMIT_MAX}`)
  }

  const body = constructAnnotationQuery(args, docType);
  const request = {
    body,
    index: esIndex,
    from: args.offset,
    size: args.limit
  };
  // console.time('esQuery');

  return es.search(request).then((resp) => {
    // console.timeEnd('esQuery');
    return resp.hits.hits;
  }).catch((e) => {
    logger.error(e);
    return e.message;
  });
};

module.exports.esCountResults = function(args, docType) {
  const body = constructAnnotationQuery(args, docType);
  const request = { body, index: esIndex };
  return es.count(request).then((resp) => {
    return resp.count;
  }).catch((e) => {
    logger.error(e);
    return e.message;
  });
};

const fieldEnumToSchemaPath = {
  DF_INSTITUTION: datasetFilters.institution.esField,
  DF_SUBMITTER_FIRST_NAME: datasetFilters.submitter.esField + '.First_Name',
  DF_SUBMITTER_SURNAME: datasetFilters.submitter.esField + '.Surname',
  DF_POLARITY: datasetFilters.polarity.esField,
  DF_ION_SOURCE: datasetFilters.ionisationSource.esField,
  DF_ANALYZER_TYPE: datasetFilters.analyzerType.esField,
  DF_ORGANISM: datasetFilters.organism.esField,
  DF_ORGANISM_PART: datasetFilters.organismPart.esField,
  DF_CONDITION: datasetFilters.condition.esField,
  DF_GROWTH_CONDITIONS: datasetFilters.growthConditions.esField,
  DF_MALDI_MATRIX: datasetFilters.maldiMatrix.esField
};

function addTermAggregations(requestBody, fields) {
  const esFields = fields.map(f => fieldEnumToSchemaPath[f]);
  let aggregations = null;
  for (let i = fields.length - 1; i >= 0; --i) {
    const f = fields[i], ef = esFields[i];
    // TODO introduce max number of groups and use sum_other_doc_count?
    let tmp = { aggs: { [f]: { terms: { field: ef, size: 1000 } } } };

    if (aggregations)
      tmp.aggs[f] = Object.assign(aggregations, tmp.aggs[f]);
    aggregations = tmp;
  }
  requestBody = Object.assign(aggregations, requestBody);
  return requestBody;
}

function flattenAggResponse(fields, aggs, idx) {
  const {buckets} = aggs[fields[idx]];
  let counts = [];
  for (let bucket of buckets) {
    const {key, doc_count} = bucket;

    // handle base case
    if (idx + 1 == fields.length) {
      counts.push({fieldValues: [key], count: doc_count});
      continue;
    }

    const nextField = fields[idx + 1],
          subAggs = {[nextField]: bucket[nextField]},
          nextCounts = flattenAggResponse(fields, subAggs, idx + 1).counts;

    for (let {fieldValues, count} of nextCounts)
      counts.push({fieldValues: [key].concat(fieldValues), count});
  }

  return { counts };
}

module.exports.esCountGroupedResults = function(args, docType) {
  const q = constructAnnotationQuery(args, docType);

  if (args.groupingFields.length == 0) {
    // handle case of no grouping for convenience
    logger.info(q);
    const request = { body: q, index: esIndex };
    return es.count(request).then((resp) => {
      return {counts: [{fieldValues: [], count: resp.count}]};
    }).catch((e) => {
      logger.error(e);
      return e.message;
    });
  }

  const body = addTermAggregations(q, args.groupingFields);
  logger.info(body);
  const request = { body, index: esIndex, size: 0 };
  console.time('esAgg');
  return es.search(request)
    .then(resp => {
      console.timeEnd('esAgg');
      return flattenAggResponse(args.groupingFields, resp.aggregations, 0);
    })
    .catch((e) => {
      logger.error(e);
      return e.message;
    });
}

function getById(docType, id) {
  return es.get({index: esIndex, type: docType, id})
  .then((resp) => {
    return resp;
  }).catch((e) => {
    logger.error(e);
    return null;
  });
}

module.exports.esAnnotationByID = function(id) {
  return getById('annotation', id);
};

module.exports.esDatasetByID = function(id) {
  return getById('dataset', id);
};
