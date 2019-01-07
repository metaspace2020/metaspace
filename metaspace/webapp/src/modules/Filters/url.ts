import { FILTER_SPECIFICATIONS, FilterKey, getDefaultFilter, Level, MetadataLists } from './filterSpecs';

import {invert} from 'lodash-es';
import { Location } from 'vue-router';

interface Dictionary<T> {
  [key: string]: T;
}

const FILTER_TO_URL: Record<FilterKey, string> = {
  database: 'db',
  group: 'grp',
  project: 'prj',
  submitter: 'subm',
  datasetIds: 'ds',
  minMSM: 'msm',
  compoundName: 'mol',
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
  metadataType: 'mdtype'
};

const URL_TO_FILTER = invert(FILTER_TO_URL) as Record<string, FilterKey>;

const PATH_TO_LEVEL: Record<string, Level> = {
  '/annotations': 'annotation',
  '/datasets': 'dataset',
  '/datasets/summary': 'dataset',
  '/upload': 'upload',
  '/projects': 'projects',
};

export const DEFAULT_TABLE_ORDER = {
  by: 'ORDER_BY_MSM',
  dir: 'DESCENDING'
};

export const DEFAULT_ANNOTATION_VIEW_SECTIONS = ['images'];

export const DEFAULT_COLORMAP = 'Viridis';

export function encodeParams(filter: any, path?: string, filterLists?: MetadataLists): Dictionary<string> {
  const level = path != null ? PATH_TO_LEVEL[path.toLowerCase()] : null;
  const defaultFilter = level != null ? getDefaultFilter(level, filterLists) : null;

  let q: Dictionary<string> = {};
  let key: FilterKey;
  for (key in FILTER_TO_URL) {
    const {levels, encoding} = FILTER_SPECIFICATIONS[key];
    if (path != null && level != null && levels.indexOf(level) == -1)
      continue;

    if (key in filter && (defaultFilter == null || filter[key] != defaultFilter[key])) {
      if (encoding == 'json')
        q[FILTER_TO_URL[key]] = JSON.stringify(filter[key]);
      else if (encoding == 'list')
        q[FILTER_TO_URL[key]] = filter[key].join(',');
      else
        q[FILTER_TO_URL[key]] = filter[key];
    }
  }
  return q;
}

export function stripFilteringParams(query: Dictionary<string>): Dictionary<string> {
  let q: Dictionary<string> = {};
  for (var key in query) {
    const fKey = URL_TO_FILTER[key];
    if (!fKey)
      q[key] = query[key];
  }
  return q;
}

export function decodeParams(location: Location, filterLists: any): Object {
  const {query, path} = location;

  if (!path || !query)
    return {};

  const level = PATH_TO_LEVEL[path];

  const filter: any = getDefaultFilter(level, filterLists);

  for (var key in query) {
    const fKey = URL_TO_FILTER[key];
    if (!fKey)
      continue; // skip params unrelated to filtering

    const {levels, encoding} = FILTER_SPECIFICATIONS[fKey];

    if (levels.indexOf(level) == -1)
      continue;

    if (encoding == 'json') {
      if ('[{'.indexOf(query[key][0]) == -1) {
        // assume non-JSON means array of one element
        filter[fKey] = [query[key]];
      } else {
        filter[fKey] = JSON.parse(query[key]);
      }
    } else if (encoding == 'list') {
      filter[fKey] = query[key] ? query[key].split(',') : [];
    } else {
      filter[fKey] = query[key];
    }

    if (filter[fKey] === null)
      filter[fKey] = undefined;
  }
  return filter;
}

const allSections = ['images', 'compounds', 'scores', 'metadata', 'adducts'].reverse();

function decodeSections(number: string): string[] {
  let sections = [],
      mask = parseInt(number).toString(2);
  for (let i = mask.length - 1; i >= 0; i--) {
    if (mask[i] == '1') {
      sections.push(allSections[allSections.length - mask.length + i]);
    }
  }
  return sections;
}

export function encodeSections(sections: string[]) {
  let str = '';
  for (let i = 0; i < allSections.length; i++) {
    let found = sections.indexOf(allSections[i]) >= 0;
    str += found ? '1' : '0';
  }
  return parseInt(str, 2);
}

function decodeSortOrder(str: string) {
  const dir = str[0] == '-' ? 'DESCENDING' : 'ASCENDING';
  if (str[0] == '-')
    str = str.slice(1);
  const by = 'ORDER_BY_' + str.toUpperCase();
  return {by, dir};
}

interface SortSettings {
  by: string
  dir: string
}

export function encodeSortOrder(settings: SortSettings): string | null {
  const dir = settings.dir == 'ASCENDING' ? '' : '-';
  const sort = dir + settings.by.replace('ORDER_BY_', '').toLowerCase();
  return sort === '-msm' ? null : sort;
}

export function decodeSettings(location: Location): any {
  const {query, path} = location;
  if (!query || !path)
    return undefined;

  let settings = {
    table: {
      currentPage: 1,
      order: DEFAULT_TABLE_ORDER,
    },

    annotationView: {
      activeSections: DEFAULT_ANNOTATION_VIEW_SECTIONS,
      colormap: DEFAULT_COLORMAP
    },

    datasets: {
      tab: 'List'
    }
  };

  if (query.page)
    settings.table.currentPage = parseInt(query.page);
  if (query.sort)
    settings.table.order = decodeSortOrder(query.sort);
  if (query.cmap)
    settings.annotationView.colormap = query.cmap;
  if (query.sections !== undefined)
    settings.annotationView.activeSections = decodeSections(query.sections);
  if (query.tab !== undefined)
    settings.datasets.tab = query.tab;
  return settings;
}
