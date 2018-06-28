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
  if (orderBy == 'ORDER_BY_MSM')
    order = 'desc';

  if (sortingOrder == 'DESCENDING')
    order = 'desc';
  else if (sortingOrder == 'ASCENDING')
    order = 'asc';

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
}

function constructAnnotationQuery(args) {
  const { orderBy, sortingOrder, offset, limit, filter, datasetFilter } = args;
  const { database, datasetName, mzFilter, msmScoreFilter,
    fdrLevel, sumFormula, adduct, compoundQuery } = filter;

  var body = {
    query: {
      bool: {
        filter: []
      }
    },
    sort: esSort(orderBy, sortingOrder)
  };
  
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

  for (var key in datasetFilters) {
    const val = datasetFilter[key];
    if (val)
      addFilter(datasetFilters[key].esFilter(val));
  }

  return body;
}

module.exports.esSearchResults = function(args) {
  if (args.limit > ES_LIMIT_MAX) {
    return Error(`The maximum value for limit is ${ES_LIMIT_MAX}`)
  }
  
  const body = constructAnnotationQuery(args);
  const request = {
    body,
    index: esIndex,
    from: args.offset,
    size: args.limit
  };
  logger.info(JSON.stringify(body));
  console.time('esQuery');
  
  return es.search(request).then((resp) => {
    console.timeEnd('esQuery');
    return resp.hits.hits;
  }).catch((e) => {
    logger.error(e);
    return e.message;
  });
};

module.exports.esCountResults = function(args) {
  const body = constructAnnotationQuery(args);
  const request = { body, index: esIndex };
  return es.count(request).then((resp) => {
    return resp.count;
  }).catch((e) => {
    logger.error(e);
    return e.message;
  });
};

module.exports.esAnnotationByID = function(id) {
  return es.get({index: esIndex, type: 'annotation', id})
    .then((resp) => {
      return resp;
    }).catch((e) => {
      logger.error(e);
      return null;
    });
};
