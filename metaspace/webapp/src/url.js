import FILTER_SPECIFICATIONS from './filterSpecs.js';

import {invert} from 'lodash';

export const DEFAULT_FILTER = {
  database: 'HMDB',
  institution: undefined,
  submitter: undefined,
  datasetIds: undefined,
  minMSM: undefined,
  compoundName: undefined,
  adduct: undefined,
  mz: undefined,
  fdrLevel: 0.1,
  polarity: undefined,
  organism: undefined,
  organismPart: undefined,
  condition: undefined,
  growthConditions: undefined,
  ionisationSource: undefined,
  maldiMatrix: undefined,
  analyzerType: undefined,
  simpleQuery: ''
};

const FILTER_TO_URL = {
  database: 'db',
  institution: 'lab',
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
  simpleQuery: 'q'
};

const URL_TO_FILTER = invert(FILTER_TO_URL);

const PATH_TO_LEVEL = {
  '/annotations': 'annotation',
  '/datasets': 'dataset'
};

export function encodeParams(filter, path) {
  const level = PATH_TO_LEVEL[path];
  let q = {};
  for (var key in FILTER_TO_URL) {
    const {levels, encoding} = FILTER_SPECIFICATIONS[key];
    if (levels.indexOf(level) == -1)
      continue;

    if (filter[key] != DEFAULT_FILTER[key]) {
      if (encoding == 'json')
        q[FILTER_TO_URL[key]] = JSON.stringify(filter[key]) || null;
      else if (encoding == 'list')
        q[FILTER_TO_URL[key]] = filter[key].join(',');
      else
        q[FILTER_TO_URL[key]] = filter[key] || null;
    }
  }
  return q;
}

export function stripFilteringParams(query) {
  let q = {};
  for (var key in query) {
    const fKey = URL_TO_FILTER[key];
    if (!fKey)
      q[key] = query[key];
  }
  return q;
}

export function decodeParams({query, path}) {
  const level = PATH_TO_LEVEL[path];

  let filter = {};
  for (var key in DEFAULT_FILTER)
    if (FILTER_SPECIFICATIONS[key].levels.indexOf(level) != -1)
      filter[key] = DEFAULT_FILTER[key];

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

function decodeSections(number) {
  number = number | 0;
  let sections = [],
      mask = number.toString(2);
  for (let i = mask.length - 1; i >= 0; i--) {
    if (mask[i] == '1') {
      sections.push(allSections[allSections.length - mask.length + i]);
    }
  }
  return sections;
}

export function encodeSections(sections) {
  let str = '';
  for (let i = 0; i < allSections.length; i++) {
    let found = sections.indexOf(allSections[i]) >= 0;
    str += found ? '1' : '0';
  }
  return parseInt(str, 2);
}

function decodeSortOrder(str) {
  const dir = str[0] == '-' ? 'DESCENDING' : 'ASCENDING';
  if (str[0] == '-')
    str = str.slice(1);
  const by = 'ORDER_BY_' + str.toUpperCase();
  return {by, dir};
}

export function encodeSortOrder({by, dir}) {
  let sort = dir == 'ASCENDING' ? '' : '-';
  return sort + by.replace('ORDER_BY_', '').toLowerCase();
}

export function decodeSettings({query, path}) {
  let settings = {
    table: {
      currentPage: 0,
      order: {
        by: 'ORDER_BY_MSM',
        dir: 'DESCENDING'
      }
    },

    annotationView: {
      activeSections: ['images'],
      colormap: 'Viridis'
    },

    datasets: {
      tab: 'List'
    }
  };

  if (query.page)
    settings.table.currentPage = query.page - 1;
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
