import { FILTER_SPECIFICATIONS, FilterKey, getDefaultFilter, Level, MetadataLists } from './filterSpecs'

import { invert, isArray, mapValues } from 'lodash-es'
import { Location } from 'vue-router'
import { ScaleType } from '../../lib/ionImageRendering'
import { DEFAULT_SCALE_TYPE } from '../../lib/constants'
import qs from 'querystring'

interface Dictionary<T> {
  [key: string]: T;
}

interface SortSettings {
  by: string;
  dir: string;
}

const FILTER_TO_URL: Record<FilterKey, string> = {
  database: 'db_id',
  group: 'grp',
  project: 'prj',
  submitter: 'subm',
  datasetIds: 'ds',
  minMSM: 'msm',
  compoundName: 'mol',
  chemMod: 'chem_mod',
  neutralLoss: 'nl',
  adduct: 'add',
  mz: 'mz',
  fdrLevel: 'fdr',
  polarity: 'mode',
  organism: 'organism',
  organismPart: 'part',
  condition: 'cond',
  growthConditions: 'grow',
  ionisationSource: 'src',
  maldiMatrix: 'matrix',
  analyzerType: 'instr',
  simpleQuery: 'q',
  simpleFilter: 'f',
  metadataType: 'mdtype',
  colocalizedWith: 'colo',
  colocalizationSamples: 'locs',
  offSample: 'offs',
}

const URL_TO_FILTER = invert(FILTER_TO_URL) as Record<string, FilterKey>

const PATH_TO_LEVEL: Record<string, Level> = {
  '/annotations': 'annotation',
  '/datasets': 'dataset',
  '/datasets/summary': 'dataset',
  '/upload': 'upload',
  '/projects': 'projects',
}

export const getLevel = (path?: string): Level | null => {
  return path != null && PATH_TO_LEVEL[path.toLowerCase()] || null
}

export const DEFAULT_TABLE_ORDER: SortSettings = {
  by: 'ORDER_BY_MSM',
  dir: 'DESCENDING',
}

export const DEFAULT_ANNOTATION_VIEW_SECTIONS = ['images']

export const DEFAULT_COLORMAP = 'Viridis'

export function encodeParams(filter: any, path?: string, filterLists?: MetadataLists): Dictionary<string> {
  const level = getLevel(path)
  const defaultFilter = level != null ? getDefaultFilter(level, filterLists) : null

  const q: Dictionary<string> = {}
  let key: FilterKey
  for (key in FILTER_TO_URL) {
    const { levels, encoding } = FILTER_SPECIFICATIONS[key]
    if (level != null && levels.indexOf(level) === -1) {
      continue
    }

    if (key in filter && (defaultFilter == null || filter[key] !== defaultFilter[key])) {
      if (encoding === 'json') {
        q[FILTER_TO_URL[key]] = JSON.stringify(filter[key])
      } else if (encoding === 'list') {
        q[FILTER_TO_URL[key]] = filter[key].join(',')
      } else if (encoding === 'bool') {
        q[FILTER_TO_URL[key]] = filter[key] ? '1' : '0'
      } else if (encoding === 'number') {
        q[FILTER_TO_URL[key]] = String(filter[key])
      } else {
        q[FILTER_TO_URL[key]] = filter[key]
      }
    }
  }
  return q
}

export function stripFilteringParams(query: Dictionary<string>): Dictionary<string> {
  const q: Dictionary<string> = {}
  for (var key in query) {
    const fKey = URL_TO_FILTER[key]
    if (!fKey) {
      q[key] = query[key]
    }
  }
  return q
}

export function decodeParams(location: Location, filterLists: any): Object {
  const { query, path } = location
  const level = path ? getLevel(path) : null

  if (!path || !query || !level) {
    return {}
  }

  const filter = getDefaultFilter(level, filterLists)

  for (var key in query) {
    const fKey = URL_TO_FILTER[key]
    if (!fKey) {
      continue
    } // skip params unrelated to filtering

    const { levels, encoding } = FILTER_SPECIFICATIONS[fKey]
    // If necessary, unwrap array parameters and take their first element. Array-valued parameters can happen
    // if someone changes the URL and adds a second copy of an existing parameter.
    const value = isArray(query[key]) ? query[key][0] : query[key]

    if (levels.indexOf(level) === -1) {
      continue
    }

    if (encoding === 'json') {
      if ('[{'.indexOf(value[0]) === -1) {
        // assume non-JSON means array of one element
        filter[fKey] = [value]
      } else {
        filter[fKey] = JSON.parse(value)
      }
    } else if (encoding === 'list') {
      filter[fKey] = value ? value.split(',') : []
    } else if (encoding === 'bool') {
      filter[fKey] = value === '1'
    } else if (encoding === 'number') {
      filter[fKey] = parseFloat(value)
    } else {
      filter[fKey] = value
    }

    if (filter[fKey] === null) {
      filter[fKey] = undefined
    }
  }
  return filter
}

const allSections = ['images', 'compounds', 'scores', 'metadata', 'adducts', 'colocalized'].reverse()

function decodeSections(number: string): string[] {
  const sections = []
  const mask = parseInt(number).toString(2)
  for (let i = mask.length - 1; i >= 0; i--) {
    if (mask[i] === '1') {
      sections.push(allSections[allSections.length - mask.length + i])
    }
  }
  return sections
}

export function encodeSections(sections: string[]) {
  let str = ''
  for (let i = 0; i < allSections.length; i++) {
    const found = sections.indexOf(allSections[i]) >= 0
    str += found ? '1' : '0'
  }
  return parseInt(str, 2)
}

function decodeSortOrder(str: string): SortSettings {
  const dir = str[0] === '-' ? 'DESCENDING' : 'ASCENDING'
  if (str[0] === '-') {
    str = str.slice(1)
  }
  const by = 'ORDER_BY_' + str.toUpperCase()
  return { by, dir }
}

export function encodeSortOrder(settings: SortSettings): string | null {
  const dir = settings.dir === 'ASCENDING' ? '' : '-'
  const sort = dir + settings.by.replace('ORDER_BY_', '').toLowerCase()
  return sort === '-msm' ? null : sort
}

export interface UrlTableSettings {
  currentPage: number;
  order: SortSettings
}

export interface UrlAnnotationViewSettings {
  activeSections: string[];
  colormap: string;
  colocalizationAlgo: string | null;
  scaleType: ScaleType;
}

export interface UrlDatasetsSettings {
  tab: string;
}

export interface UrlSettings {
  table: UrlTableSettings;
  annotationView: UrlAnnotationViewSettings;
  datasets: UrlDatasetsSettings;
}

export function decodeSettings(location: Location): UrlSettings | undefined {
  let { query, path } = location
  if (!query || !path) {
    return undefined
  }

  // When vue-router encounters the same query parameter more than once it supplies an array instead of a string.
  // To prevent type errors below, find any arrayified parameters and just take their first element
  query = mapValues(query, (stringOrArray:string|string[]) =>
    isArray(stringOrArray) ? stringOrArray[0] : stringOrArray)

  const settings: UrlSettings = {
    table: {
      currentPage: 1,
      order: DEFAULT_TABLE_ORDER,
    },

    annotationView: {
      activeSections: DEFAULT_ANNOTATION_VIEW_SECTIONS,
      colormap: DEFAULT_COLORMAP,
      colocalizationAlgo: null,
      scaleType: DEFAULT_SCALE_TYPE,
    },

    datasets: {
      tab: 'List',
    },
  }

  if (query.page) {
    settings.table.currentPage = parseInt(query.page)
  }
  if (query.sort) {
    settings.table.order = decodeSortOrder(query.sort)
  }
  if (query.cmap) {
    settings.annotationView.colormap = query.cmap
  }
  if (query.scale) {
    settings.annotationView.scaleType = (query.scale || DEFAULT_SCALE_TYPE) as ScaleType
  }
  if (query.sections !== undefined) {
    settings.annotationView.activeSections = decodeSections(query.sections)
  }
  if (query.alg) {
    settings.annotationView.colocalizationAlgo = query.alg
  }
  if (query.tab !== undefined) {
    settings.datasets.tab = query.tab
  }
  return settings
}

const dbIds: Record<string, number> = {
  'EMBL-dev1': 30,
  'EMBL-dev2': 32,
  'M4I_1-2019-06': 34,
  'GNPS-pseudomonas-2019-09': 35,
  'NPA-2019-08': 36,
  'BraChemDB-2018-01': 18,
  'ChEBI-2018-01': 19,
  'HMDB-v4': 22,
  'HMDB-v4-endogenous': 23,
  'LipidMaps-2017-12-12': 24,
  'PAMDB-v1.0': 25,
  'SwissLipids-2018-02-02': 26,
  'HMDB-v4-cotton': 27,
  'ECMDB-2018-12': 33,
  LIPID_MAPS: 3,
  SwissLipids: 4,
  ChEBI: 2,
  'HMDB-v2.5': 6,
  'HMDB-v2.5-cotton': 8,
  core_metabolome_v2: 37,
  core_metabolome_v3: 38,
  whole_body_MSMS_test: 40,
  whole_body_MSMS_test_v2: 41,
  whole_body_MSMS_test_v3: 42,
}

export function updateDBParam(queryString: string): string | null {
  const { db, ...params } = qs.parse(queryString)
  if (typeof db === 'string') {
    if (db in dbIds) {
      return qs.stringify({ ...params, [FILTER_TO_URL.database]: dbIds[db] })
    }
    // return not found?
  }
  return null
}
