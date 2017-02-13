/**
 * Created by intsco on 1/11/17.
 */

const elasticsearch = require('elasticsearch');

const smEngineConfig = require('./sm_config.json'),
  {datasetFilters, dsField} = require('./datasetFilters.js');

const esConfig = () => {
  const {host, port} = smEngineConfig.elasticsearch;
  return {
    hosts: [`${host}:${port}`],
    apiVersion: '2.4'
  }
};

const esIndex = smEngineConfig.elasticsearch.index;
const es = new elasticsearch.Client(esConfig());

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

function constructAnnotationQuery(args) {
  const { orderBy, sortingOrder, offset, limit, filter, datasetFilter } = args;
  const { database, datasetId, datasetName, mzFilter, msmScoreFilter,
    fdrLevel, sumFormula, adduct, compoundQuery } = filter;
  
  var body = {
    query: {
      constant_score: {
        filter: {
          bool: {
            must: [
              // {term: {db_name: database}}
            ]
          }
        }
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

module.exports.esSearchResults = function(args) {
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
};

module.exports.esCountResults = function(args) {
  const body = constructAnnotationQuery(args);
  const request = { body, index: esIndex };
  return es.count(request).then((resp) => {
    return resp.count;
  }).catch((err) => {
    console.log(err);
    return 0;
  });
};
