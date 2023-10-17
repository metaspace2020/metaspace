/* eslint-disable camelcase */
import { UserProjectRoleOptions as UPRO } from './src/modules/project/model'
import * as elasticsearch from '@elastic/elasticsearch'
import * as sprintf from 'sprintf-js'
import config from './src/utils/config'
import { datasetFilters } from './datasetFilters'
import { ContextUser } from './src/context'
import { AnnotationFilter, AnnotationOrderBy, DatasetFilter, DatasetOrderBy, SortingOrder } from './src/binding'
import * as _ from 'lodash'

const ES_LIMIT_MAX = 50000

type DocType = 'dataset' | 'annotation';

export interface ESDataset {
  _source: ESDatasetSource;
}

export interface ESAnnotation {
  _id: string;
  _source: ESAnnotationSource;
}

export type ImageStorageType = 'fs';

export interface ESDatasetSource {
  ds_id: string;
  ds_name: string;
  ds_upload_dt: string;
  ds_config: any;
  ds_meta: any;
  ds_status: string;
  ds_status_update_dt: string;
  ds_input_path: string;
  ds_ion_img_storage: ImageStorageType;
  ds_is_public: boolean;
  ds_moldb_ids: number[];
  ds_adducts: string[];
  ds_neutral_losses: string[];
  ds_chem_mods: string[];
  ds_acq_geometry: any;
  ds_size_hash: any;
  ds_submitter_id: string;
  ds_submitter_name: string;
  ds_submitter_email: string;
  ds_group_id: string | null;
  ds_group_name: string | null;
  ds_group_short_name: string | null;
  ds_group_approved: boolean;
  ds_project_ids?: string[];
  ds_ion_thumbnail_url: string;
  annotation_counts: any[];
}

export interface Isobar {
  ion: string;
  ion_formula: string;
  msm: number;
  peak_ns: number[];
}

export interface ESAnnotationSource extends ESDatasetSource {
  job_id: number;

  db_id: number;
  db_name: string;
  db_version: any;

  formula: string;
  adduct: string;
  neutral_loss: string;
  chem_mod: string;
  ion: string;
  ion_formula: string;
  polarity: '-'|'+';

  mz: number;
  centroid_mzs: number[];
  iso_image_ids: (string|null)[]; // FIXME: remove after data migration
  iso_image_urls?: (string|null)[];
  total_iso_ints: number[];
  min_iso_ints: number[];
  max_iso_ints: number[];
  is_mono: boolean;

  chaos: number;
  image_corr: number;
  pattern_match: number;
  metrics?: Record<string, any>;

  theo_mz?: number[];
  theo_ints?: number[];
  mz_mean?: number[];
  mz_stddev?: number[];

  fdr: number;
  msm: number;
  comp_ids: string[];
  comp_names: string[];
  comps_count_with_isomers?: number;
  isomer_ions: string[];
  isobars?: Isobar[];

  off_sample_prob?: number;
  off_sample_label?: 'on' | 'off';
}

const searchable_txt_annotation_fields = ['db_name',
  'formula',
  'adduct',
  'neutral_loss',
  'chem_mod',
  'ion',
  'ion_formula',
  'comp_ids',
  'comp_names',
  'isomer_ions']

const searchable_txt_dataset_fields = ['ds_id',
  'ds_status',
  'ds_adducts',
  'ds_neutral_losses',
  'ds_chem_mods',
  'ds_submitter_id',
  'ds_submitter_name',
  'ds_submitter_email',
  'ds_group_id',
  'ds_group_name',
  'ds_group_short_name',
  'ds_project_id',
  'ds_ion_thumbnail_url']

export interface ESAggAnnotationSource {
  ion: string
  dbId: number
  datasetIds: string[]
  annotations: ESAnnotation[]
}

const esConfig = () => {
  return {
    node: `${config.elasticsearch.schema}://${config.elasticsearch.host}:${config.elasticsearch.port}`,
  }
}

const esDatasetIndex = config.elasticsearch.dataset_index
const esAnnotationIndex = config.elasticsearch.annotation_index
const es = new elasticsearch.Client(esConfig())

const esFormatMz = (mz: number) => {
  // transform m/z into a string according to sm.engine.es_export;
  // add extra 2 digits after decimal place for search queries
  return sprintf.sprintf('%012.6f', mz)
}

const esSort = (orderBy: AnnotationOrderBy | DatasetOrderBy, sortingOrder: SortingOrder | null) => {
  // default order
  let order: 'asc' | 'desc' = 'asc'
  if (orderBy === 'ORDER_BY_MSM' || orderBy === 'ORDER_BY_DATE') {
    order = 'desc'
  }

  if (sortingOrder === 'DESCENDING') {
    order = 'desc'
  } else if (sortingOrder === 'ASCENDING') {
    order = 'asc'
  }

  const sortTerm = (field: string, order: 'asc' | 'desc') => {
    const obj: any = {}
    // unmapped_type to avoid exceptions in ES when where is nothing to sort
    obj[field] = { order: order, unmapped_type: 'string' }
    return obj
  }

  // annotation orderings
  if (orderBy === 'ORDER_BY_MZ') {
    return [sortTerm('mz', order)]
  } else if (orderBy === 'ORDER_BY_MSM') {
    return [sortTerm('msm', order)]
  } else if (orderBy === 'ORDER_BY_FDR_MSM') {
    return [sortTerm('fdr', order), sortTerm('msm', order === 'asc' ? 'desc' : 'asc')]
  } else if (orderBy === 'ORDER_BY_DATASET') {
    return [sortTerm('ds_name', order), sortTerm('mz', order)]
  } else if (orderBy === 'ORDER_BY_FORMULA') {
    return [sortTerm('formula', order), sortTerm('adduct', order), sortTerm('fdr', order)]
  } else if (orderBy === 'ORDER_BY_OFF_SAMPLE') {
    return [sortTerm('off_sample_prob', order)]
  } else if (orderBy === 'ORDER_BY_DATE') {
    // dataset orderings
    return [
      sortTerm('ds_status_update_dt', order),
      sortTerm('ds_last_finished', order),
    ]
  } else if (orderBy === 'ORDER_BY_DS_SUBMITTER_NAME') {
    return [sortTerm('ds_submitter_name', order)]
  } else if (orderBy === 'ORDER_BY_ANNOTATION_COUNTS') {
    return [
      {
        _script: {
          type: 'number',
          script: {
            inline: 'int maxCountFDR10 = 0; if(params._source.annotation_counts == null) { return -1 } '
                + 'for (dbs in params._source.annotation_counts) { for (counts in dbs.counts)'
                + ' { if (counts.level == 10 && counts.n > maxCountFDR10) { maxCountFDR10 = counts.n; } } }'
                + ' return maxCountFDR10;',
          },
          order: order,
        },
      },
    ]
  } else if (orderBy === 'ORDER_BY_NAME') {
    return [sortTerm('ds_name', order)]
  } else if (orderBy === 'ORDER_BY_UP_DATE') {
    return [
      sortTerm('ds_upload_dt', order),
      sortTerm('ds_last_finished', order),
    ]
  } else if (orderBy === 'ORDER_BY_ADDUCT') {
    return [sortTerm('adduct', order)]
  } else if (orderBy === 'ORDER_BY_GROUP') {
    return [sortTerm('ds_group_name', order)]
  } else if (orderBy === 'ORDER_BY_DATABASE') {
    return [sortTerm('db_name', order)]
  } else if (orderBy === 'ORDER_BY_CHAOS') {
    return [sortTerm('chaos', order)]
  } else if (orderBy === 'ORDER_BY_SPATIAL') {
    return [sortTerm('image_corr', order)]
  } else if (orderBy === 'ORDER_BY_SPECTRAL') {
    return [sortTerm('pattern_match', order)]
  } else if (orderBy === 'ORDER_BY_MAX_INT') {
    return [
      {
        _script: {
          type: 'number',
          script: {
            lang: 'painless',
            inline: 'params._source.max_iso_ints[0]',
          },
          order: order,
        },
      },
    ]
  } else if (orderBy === 'ORDER_BY_TOTAL_INT') {
    return [
      {
        _script: {
          type: 'number',
          script: {
            lang: 'painless',
            inline: 'params._source.total_iso_ints[0]',
          },
          order: order,
        },
      },
    ]
  } else if (orderBy === 'ORDER_BY_ISOMERS') {
    return [
      {
        _script: {
          type: 'number',
          script: {
            lang: 'painless',
            inline: 'params._source.comp_names.size()',
          },
          order: order,
        },
      },
    ]
  } else if (orderBy === 'ORDER_BY_ISOBARS') {
    return [
      {
        _script: {
          type: 'number',
          script: {
            lang: 'painless',
            inline: 'params._source.isobars.size()',
          },
          order: order,
        },
      },
    ]
  }
}

const constructRangeFilter = (
  field: keyof ESAnnotationSource, interval: { min: number|string|null, max: number|string|null }
) => {
  const range = {} as any
  const { min, max } = interval
  if (min != null) {
    range.gte = min
  }
  if (max != null) {
    range.lt = max
  }
  return { range: { [field]: range } }
}

const constructTermOrTermsFilter = (field: keyof ESAnnotationSource, valueOrValues: any) => {
  if (Array.isArray(valueOrValues)) {
    return { terms: { [field]: valueOrValues } }
  } else {
    return { term: { [field]: valueOrValues } }
  }
}

const constructDatasetAuthFilters = async(user: ContextUser) => {
  // (!) Authorisation checks
  if (user.id != null && user.role === 'admin') {
    // Admins can see everything - don't filter
    return []
  } else {
    // Public datasets, except failed ones
    const datasetOrConditions: any[] = [
      {
        bool: {
          must: [
            {
              term: {
                ds_is_public: true,
              },
            },
            {
              terms: {
                ds_status: ['ANNOTATING', 'QUEUED', 'FINISHED'],
              },
            },
          ],
        },
      },
    ]
    // User is owner
    if (user.id) {
      datasetOrConditions.push({ term: { ds_submitter_id: user.id } })
    }
    // User's group
    const groupIds = await user.getMemberOfGroupIds()
    if (groupIds.length > 0) {
      datasetOrConditions.push({
        bool: {
          filter: [
            { terms: { ds_group_id: groupIds } },
            // { term: { ds_group_approved: true } },
          ],
        },
      })
    }
    // Projects user has access to
    const visibleProjectIds = Object.entries(await user.getProjectRoles() || [])
      .filter(([, role]) => ([UPRO.MEMBER, UPRO.MANAGER, UPRO.REVIEWER] as any[]).includes(role))
      .map(([id]) => id)
    if (visibleProjectIds.length > 0) {
      datasetOrConditions.push({ terms: { ds_project_ids: visibleProjectIds } })
    }
    return [{ bool: { should: datasetOrConditions } }]
  }
}

const constructDatabaseAuthFilters = async(user: ContextUser) => {
  // Databases user has access to
  return [{ terms: { db_id: await user.getVisibleDatabaseIds() } }]
}

const constructDatasetFilters = (filter: DatasetFilter) => {
  const filters : any = []
  for (const [key, val] of (Object.entries(filter) as [keyof DatasetFilter, any][])) {
    if (val) {
      const datasetFilter = datasetFilters[key]
      if (datasetFilter != null) {
        let esFilter : any = datasetFilter.esFilter(val)
        if (Array.isArray(esFilter) && esFilter.length === 1) {
          esFilter = esFilter[0]
        }
        filters.push(esFilter)
      } else if (datasetFilter === undefined) {
        console.error(`Missing datasetFilter[${key}]`)
      }
    }
  }

  return filters
}

interface ExtraAnnotationFilters {
  annotationId?: string;
}

const constructAnnotationFilters = (filter: AnnotationFilter & ExtraAnnotationFilters) => {
  const {
    databaseId, datasetName, mzFilter, msmScoreFilter, fdrLevel,
    sumFormula, chemMod, neutralLoss, adduct, ion, ionFormula, offSample, compoundQuery, annotationId,
    isobaricWith, hasNeutralLoss, hasChemMod, hasHiddenAdduct,
  } = filter
  const filters : any = []

  if (mzFilter) {
    filters.push(constructRangeFilter('mz', {
      min: esFormatMz(mzFilter.min),
      max: esFormatMz(mzFilter.max),
    }))
  }

  if (msmScoreFilter) {
    filters.push(constructRangeFilter('msm', msmScoreFilter))
  }

  if (fdrLevel) {
    filters.push(constructRangeFilter('fdr', { min: null, max: fdrLevel + 1e-3 }))
  }

  if (annotationId) { filters.push({ terms: { _id: annotationId.split('|') } }) }
  if (databaseId) { filters.push({ term: { db_id: databaseId } }) }
  if (chemMod != null) { filters.push({ term: { chem_mod: chemMod } }) }
  if (neutralLoss != null) { filters.push({ term: { neutral_loss: neutralLoss } }) }
  if (adduct != null) { filters.push({ term: { adduct: adduct } }) }
  if (datasetName) { filters.push({ term: { ds_name: datasetName } }) }
  if (offSample != null) { filters.push({ term: { off_sample_label: offSample ? 'off' : 'on' } }) }
  if (hasNeutralLoss === false) {
    filters.push({ term: { neutral_loss: '' } })
  }
  if (hasChemMod === false) {
    filters.push({ term: { chem_mod: '' } })
  }
  if (hasHiddenAdduct === false) {
    filters.push({
      bool: { must_not: [{ terms: { adduct: config.adducts.filter(a => a.hidden).map(a => a.adduct) } }] },
    })
  }
  if (ion != null) {
    filters.push(constructTermOrTermsFilter('ion', ion))
  }

  if (sumFormula != null) {
    filters.push(constructTermOrTermsFilter('formula', sumFormula))
  }

  if (ionFormula != null) {
    filters.push(constructTermOrTermsFilter('ion_formula', ionFormula))
  }
  if (isobaricWith != null) {
    filters.push(constructTermOrTermsFilter('isobars.ion_formula' as any, isobaricWith))
  }

  if (compoundQuery) {
    filters.push({
      bool: {
        should: [
          { wildcard: { comp_names: `*${compoundQuery.toLowerCase()}*` } },
          { term: { formula: compoundQuery } }],
      },
    })
  }

  return filters
}

const constructSimpleQueryFilter = (simpleQuery: string, fields = searchable_txt_dataset_fields) => {
  return {
    bool: {
      should: [
        {
          regexp: {
            ds_name: {
              value: `.*${simpleQuery}.*`,
              flags: 'ALL',
              case_insensitive: true,
            },
          },
        },
        {
          simple_query_string: {
            query: simpleQuery,
            fields,
            default_operator: 'and',
          },
        },
      ],

    },

  }
}

const constructESQuery = async(
  args: any, docType: DocType, user: ContextUser, bypassAuth = false
) => {
  const { orderBy, sortingOrder, filter, datasetFilter, simpleQuery } = args

  const dsFilters = constructDatasetFilters(datasetFilter || {})

  return {
    query: {
      bool: {
        filter: [
          ...(bypassAuth ? [] : await constructDatasetAuthFilters(user)),
          ...(bypassAuth || docType === 'dataset' ? [] : await constructDatabaseAuthFilters(user)),
          ...dsFilters,
          ...constructAnnotationFilters(filter || {}),
          ...(simpleQuery
            ? [constructSimpleQueryFilter(simpleQuery, docType === 'dataset'
                ? searchable_txt_dataset_fields
                : searchable_txt_annotation_fields.concat(searchable_txt_dataset_fields))]
            : []),
        ],
      },
    },
    ...(orderBy ? { sort: esSort(orderBy, sortingOrder) } : {}),
  }
}

export const esSearchResults = async(args: any, docType: DocType,
  user: ContextUser, bypassAuth?: boolean): Promise<any[]> => {
  if (args.limit > ES_LIMIT_MAX) {
    throw Error(`The maximum value for limit is ${ES_LIMIT_MAX}`)
  }

  const body = await constructESQuery(args, docType, user, bypassAuth)
  const request = {
    body,
    index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex,
    from: args.offset,
    size: args.limit,
  }
  const resp = await es.search(request)

  return resp.hits.hits
}

export const esCountResults = async(args: any, docType: DocType, user: ContextUser): Promise<number> => {
  const body = await constructESQuery(args, docType, user)
  const request = { body, index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex }
  const resp = await es.count(request)

  return resp.count
}

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
  DF_MALDI_MATRIX: datasetFilters.maldiMatrix.esField,
  DF_STATUS: 'ds_status',
}

const constructTermAggregations = (fields: (keyof typeof fieldEnumToSchemaPath)[]) => {
  const esFields = fields.map(f => fieldEnumToSchemaPath[f])
  let aggs
  for (let i = fields.length - 1; i >= 0; --i) {
    const f = fields[i]; const ef = esFields[i]
    // TODO introduce max number of groups and use sum_other_doc_count?
    const terms = typeof ef === 'string' ? { field: ef, size: 1000 } : ef
    aggs = { [f]: { terms, aggs } }
  }
  return aggs
}

const flattenAggResponse = (fields: string[], aggs: any, idx: number): any => {
  const { buckets } = aggs[fields[idx]]
  const counts = []
  for (const bucket of buckets) {
    const { key, doc_count } = bucket

    // handle base case
    if (idx + 1 === fields.length) {
      counts.push({ fieldValues: [key], count: doc_count })
      continue
    }

    const nextField = fields[idx + 1]
    const subAggs = { [nextField]: bucket[nextField] }
    const nextCounts = flattenAggResponse(fields, subAggs, idx + 1).counts

    for (const { fieldValues, count } of nextCounts) {
      counts.push({ fieldValues: [key].concat(fieldValues), count })
    }
  }

  return { counts }
}

export const esCountGroupedResults = async(args: any, docType: DocType, user: ContextUser): Promise<any> => {
  const body = await constructESQuery(args, docType, user)

  if (args.groupingFields.length === 0) {
    // handle case of no grouping for convenience
    const request = { body, index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex }
    const resp = await es.count(request)
    return { counts: [{ fieldValues: [], count: resp.count }] }
  }

  const aggRequest = {
    body: {
      ...body,
      aggs: constructTermAggregations(args.groupingFields),
    },
    index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex,
    size: 0,
  }
  const resp = await es.search(aggRequest)
  return flattenAggResponse(args.groupingFields, resp.aggregations, 0)
}

export const esRawAggregationResults = async(args: any, docType: DocType,
  user: ContextUser): Promise<ESAggAnnotationSource[]> => {
  const body = await constructESQuery(args, docType, user)

  const aggRequest = {
    body: {
      ...body,
      aggs: {
        unique_formulas: {
          terms: {
            field: 'ion',
            size: 1000000, // given ES agg pagination lacking, here we need a big number to return everything
          },
          aggs: {
            unique_db_ids: {
              terms: {
                field: 'db_id',
              },
              aggs: {
                unique_ds_ids: {
                  terms: {
                    field: 'ds_id',
                  },
                  aggs: {
                    include_source: {
                      top_hits: {
                        _source: {},
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex,
    size: 0,
  }
  const resp = await es.search(aggRequest)
  const aggAnnotations : ESAggAnnotationSource[] = []

  if (resp.aggregations) {
    resp.aggregations.unique_formulas.buckets.forEach((agg:any) => {
      agg.unique_db_ids.buckets.forEach((db: any) => {
        const item: ESAggAnnotationSource = {
          ion: agg.key,
          dbId: db.key,
          datasetIds: [],
          annotations: [],
        }
        db.unique_ds_ids.buckets.forEach((ds: any) => {
          item.datasetIds.push(ds.key)
          item.annotations.push(ds.include_source.hits.hits[0])
        })
        aggAnnotations.push(item)
      })
    })
  }
  return aggAnnotations
}

export const esCountMatchingAnnotationsPerDataset = async(
  args: any, user: ContextUser
): Promise<Record<string, number>> => {
  const body = await constructESQuery(args, 'annotation', user)
  const aggRequest = {
    body: {
      ...body,
      aggs: { ds_id: { terms: { field: 'ds_id', size: 1000000 } } },
    },
    index: esAnnotationIndex,
    size: 0,
  }
  const resp = await es.search(aggRequest)
  const counts = resp?.aggregations?.ds_id.buckets.map(({ key, doc_count }: any) => [key, doc_count])
  return _.fromPairs(counts)
}

export interface FilterValueCountArgs {
  filters: any[];
  aggsTerms: any;
  user: ContextUser;
  docType?: DocType;
}

export const esFilterValueCountResults = async(args: FilterValueCountArgs): Promise<any> => {
  const { filters, aggsTerms, user, docType = 'dataset' } = args
  const body = {
    query: {
      bool: {
        filter: [
          ...await constructDatasetAuthFilters(user),
          ...filters,
        ],
      },
    },
    size: 0, // return only aggregations
    aggs: { field_counts: aggsTerms },
  }

  const resp = await es.search({
    body,
    index: docType === 'dataset' ? esDatasetIndex : esAnnotationIndex,
  })
  const itemCounts: { [key: string]: number } = {}
  resp?.aggregations?.field_counts.buckets.forEach((o: any) => {
    itemCounts[o.key] = o.doc_count
  })

  return itemCounts
}

const getFirst = async(args: any, docType: DocType, user: ContextUser, bypassAuth = false) => {
  const docs = await esSearchResults(args, docType, user, bypassAuth)
  return docs && docs[0] && docs[0]._source ? docs[0] : null
}

export const esAnnotationByID = async(id: string, user: ContextUser): Promise<ESAnnotation | null> => {
  if (id) {
    return getFirst({ filter: { annotationId: id } }, 'annotation', user)
  }
  return null
}

export const esAnnotationByIon = async(ion: string, datasetId: string,
  databaseId: string,
  user: ContextUser): Promise<ESAnnotation | null> => {
  if (ion) {
    return getFirst({ datasetFilter: { ids: datasetId }, filter: { ion, databaseId } },
      'annotation', user)
  }
  return null
}

export const esDatasetByID = async(id: string, user: ContextUser,
  bypassAuth?: boolean): Promise<ESDataset | null> => {
  if (id) {
    return getFirst({ datasetFilter: { ids: id } }, 'dataset', user, bypassAuth)
  }
  return null
}
