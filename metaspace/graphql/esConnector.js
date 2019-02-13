/**
 * Created by intsco on 1/11/17.
 */
import {UserProjectRoleOptions as UPRO} from './src/modules/project/model';
import * as elasticsearch from 'elasticsearch';
import * as sprintf from 'sprintf-js';
import * as config from 'config';
import {datasetFilters} from './datasetFilters.js';
import {logger} from './utils';

const ES_LIMIT_MAX = 50000;


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
  if (orderBy === 'ORDER_BY_MSM' || orderBy === 'ORDER_BY_DATE')
    order = 'desc';

  if (sortingOrder === 'DESCENDING')
    order = 'desc';
  else if (sortingOrder === 'ASCENDING')
    order = 'asc';

  const sortTerm = (field, order) => {
    const obj = {};
    // unmapped_type to avoid exceptions in ES when where is nothing to sort
    obj[field] = { order: order, unmapped_type: 'string' };
    return obj;
  };

  // annotation orderings
  if (orderBy === 'ORDER_BY_MZ')
    return [sortTerm('mz', order)];
    // return sortTerms([{ mz: order }]);
  else if (orderBy === 'ORDER_BY_MSM')
    return [sortTerm('msm', order)];
  else if (orderBy === 'ORDER_BY_FDR_MSM')
    return [sortTerm('fdr', order), sortTerm('msm', order === 'asc' ? 'desc' : 'asc')];
  else if (orderBy === 'ORDER_BY_DATASET')
    return [sortTerm('ds_name', order), sortTerm('mz', order)];
  else if (orderBy === 'ORDER_BY_FORMULA')
    return [sortTerm('sf', order), sortTerm('adduct', order), sortTerm('fdr', order)];
  // dataset orderings
  else if (orderBy === 'ORDER_BY_DATE')
    return [sortTerm('ds_last_finished', order)];
  else if (orderBy === 'ORDER_BY_NAME')
    return [sortTerm('ds_name', order)];
}

function constructRangeFilter(field, interval) {
  return {
    range: {
      [field]: {
        gte: interval.min,
        lt: interval.max,
      },
    },
  };
}

function constructTermOrTermsFilter(field, valueOrValues) {
  if (Array.isArray(valueOrValues)) {
    return { terms: { [field]: valueOrValues } };
  } else {
    return { term: { [field]: valueOrValues } };
  }
}

const constructAuthFilters = (user, userProjectRoles) => {

  // (!) Authorisation checks
  if (user != null && user.role === 'admin') {
    // Admins can see everything - don't filter
    return []
  } else if (user != null && user.id != null) {
    const should = [
      { term: { ds_is_public: true } },
      { term: { ds_submitter_id: user.id } },
    ];

    if (user.groupIds) {
      should.push({
        bool: {
          filter: [
            { terms: { ds_group_id: user.groupIds } },
            { term: { ds_group_approved: true } },
          ]
        }
      });
    }
    const visibleProjectIds = Object.entries(userProjectRoles || [])
                                    .filter(([id, role]) => [UPRO.MEMBER, UPRO.MANAGER].includes(role))
                                    .map(([id, role]) => id);
    if (visibleProjectIds.length > 0) {
      should.push({ terms: { ds_project_ids: visibleProjectIds } });
    }
    return [{ bool: { should } }];
  } else {
    // not logged in user
    return [{ term: { ds_is_public: true } }];
  }
};

function constructDatasetFilters(filter) {
  const filters = [];
  for (let [key, val] of Object.entries(filter)) {
    if (val) {
      if (datasetFilters[key] != null) {
        filters.push(datasetFilters[key].esFilter(val));
      } else {
        console.error(`Missing datasetFilter[${key}]`);
      }
    }
  }
  return filters;
}

function constructAnnotationFilters(filter) {
  const { database, datasetName, mzFilter, msmScoreFilter, fdrLevel, sumFormula, adduct, sfAdduct, compoundQuery, annId } = filter;
  const filters = [];

  if (mzFilter)
    filters.push(constructRangeFilter('mz', {min: esFormatMz(mzFilter.min),
      max: esFormatMz(mzFilter.max)}));

  if (msmScoreFilter)
    filters.push(constructRangeFilter('msm', msmScoreFilter));

  if (fdrLevel)
    filters.push(constructRangeFilter('fdr', {min: 0, max: fdrLevel + 1e-3}));

  if (annId)
    filters.push({term: { _id: annId }});
  if (database)
    filters.push({term: {db_name: database}});
  if (sumFormula)
    filters.push({term: {sf: sumFormula}});
  if (adduct != null)
    filters.push({term: {adduct: adduct}});
  if (datasetName)
    filters.push({term: {ds_name: datasetName}});

  if (sfAdduct)
    filters.push(constructTermOrTermsFilter('sf_adduct', sfAdduct));

  if (compoundQuery) {
    filters.push({
      bool: {
        should: [
          { wildcard: { comp_names: `*${compoundQuery.toLowerCase()}*` } },
          { term: { sf: compoundQuery } }]
      }
    });
  }

  return filters;
}

function constructSimpleQueryFilter(simpleQuery) {
  return {
    simple_query_string: {
      query: simpleQuery,
      fields: ["_all"],
      default_operator: "and"
    }
  };
}

function constructESQuery(args, docType, user, userProjectRoles, bypassAuth) {
  const { orderBy, sortingOrder, filter, datasetFilter, simpleQuery} = args;

  return {
    query: {
      bool: {
        filter: [
          {term: {_type: docType}},
          ...(bypassAuth ? [] : constructAuthFilters(user, userProjectRoles)),
          ...constructDatasetFilters(datasetFilter || {}),
          ...constructAnnotationFilters(filter || {}),
          ...(simpleQuery ? [constructSimpleQueryFilter(simpleQuery)] : []),
        ]
      }
    },
    ...(orderBy ? {sort: esSort(orderBy, sortingOrder)} : {}),
  };
}

export const esSearchResults = async function(args, docType, user, bypassAuth) {
  if (args.limit > ES_LIMIT_MAX) {
    return Error(`The maximum value for limit is ${ES_LIMIT_MAX}`)
  }

  const body = constructESQuery(args, docType, user, user != null ? await user.getProjectRoles() : {}, bypassAuth);
  const request = {
    body,
    index: esIndex,
    from: args.offset,
    size: args.limit
  };
  // console.time('esQuery');

  const resp = await es.search(request);
  return resp.hits.hits;
};


export const esCountResults = async function(args, docType, user) {
  const body = constructESQuery(args, docType, user, user != null ? await user.getProjectRoles() : {});
  const request = { body, index: esIndex };
  const resp = await es.count(request);
  return resp.count;
};

const fieldEnumToSchemaPath = {
  DF_GROUP: 'ds_group_short_name',
  DF_SUBMITTER_NAME: 'ds_submitter_name',
  DF_POLARITY: datasetFilters.polarity.esField,
  DF_ION_SOURCE: datasetFilters.ionisationSource.esField,
  DF_ANALYZER_TYPE: datasetFilters.analyzerType.esField,
  DF_ORGANISM: datasetFilters.organism.esField,
  DF_ORGANISM_PART: datasetFilters.organismPart.esField,
  DF_CONDITION: datasetFilters.condition.esField,
  DF_GROWTH_CONDITIONS: datasetFilters.growthConditions.esField,
  DF_MALDI_MATRIX: datasetFilters.maldiMatrix.esField
};

function constructTermAggregations(fields) {
  const esFields = fields.map(f => fieldEnumToSchemaPath[f]);
  let aggs = undefined;
  for (let i = fields.length - 1; i >= 0; --i) {
    const f = fields[i], ef = esFields[i];
    // TODO introduce max number of groups and use sum_other_doc_count?
    const terms = typeof ef === 'string' ? { field: ef, size: 1000 } : ef;
    aggs = { [f]: { terms, aggs } };
  }
  return aggs;
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

export const esCountGroupedResults = async function (args, docType, user) {
  const body = constructESQuery(args, docType, user, user != null ? await user.getProjectRoles() : {});

  if (args.groupingFields.length === 0) {
    // handle case of no grouping for convenience
    logger.debug(body);
    const request = { body, index: esIndex };
    try {
      const resp = await es.count(request);
      return {counts: [{fieldValues: [], count: resp.count}]};
    } catch (e) {
      logger.error(e);
      return e.message;
    }
  }

  body.aggs = constructTermAggregations(args.groupingFields);

  logger.debug(body);
  const request = { body, index: esIndex, size: 0 };
  try {
    const resp = await es.search(request);
    return flattenAggResponse(args.groupingFields, resp.aggregations, 0);
  } catch (e) {
    logger.error(e);
    return e.message;
  }
};

export const esFilterValueCountResults = async (args, user) => {
  const {wildcard, aggsTerms} = args;
  const body = {
    query: {
      bool: {
        filter: [
          ...constructAuthFilters(user, user != null ? await user.getProjectRoles() : {}),
          { term: { _type: 'dataset' } },
          wildcard,
        ]
      }
    },
    size: 0,  // return only aggregations
    aggs: { field_counts: aggsTerms }
  };

  const resp = await es.search({
    body,
    index: esIndex
  });
  const itemCounts = {};
  resp.aggregations.field_counts.buckets.forEach((o) => {
    itemCounts[o.key] = o.doc_count;
  });
  return itemCounts;
};

async function getFirst(args, docType, user, bypassAuth) {
  const docs = await esSearchResults(args, docType, user, bypassAuth);
  return docs && docs[0] && docs[0]._source ? docs[0] : null;
}

export const esAnnotationByID = async function(id, user) {
  if (id)
    return getFirst({ filter: { annId: id } }, 'annotation', user);
  return null;
};

export const esDatasetByID = async function(id, user, bypassAuth) {
  if (id)
    return getFirst({ datasetFilter: { ids: id } }, 'dataset', user, bypassAuth);
  return null;
};

