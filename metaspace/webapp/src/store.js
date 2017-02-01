import FILTER_SPECIFICATIONS from './filterSpecs.js';
import router from './router.js';

import Vue from 'vue';
import Vuex from 'vuex';
Vue.use(Vuex);

const DEFAULT_FILTER = {
  database: 'HMDB',
  institution: undefined,
  datasetName: undefined,
  minMSM: 0.1,
  compoundName: undefined,
  adduct: undefined,
  mz: undefined,
  fdrLevel: 0.1,
  polarity: undefined,
  organism: undefined,
  ionisationSource: undefined,
  maldiMatrix: undefined
};

function revMap(d) {
  let revd = {};
  for (var key in d)
    if (d.hasOwnProperty(key))
    revd[d[key]] = key;
  return revd;
}

const FILTER_TO_URL = {
  database: 'db',
  institution: 'inst',
  datasetName: 'ds',
  minMSM: 'msmthr',
  compoundName: 'mol',
  adduct: 'add',
  mz: 'mz',
  fdrLevel: 'fdrlvl',
  polarity: 'mode',
  organism: 'organism',
  ionisationSource: 'src',
  maldiMatrix: 'matrix'
};

const URL_TO_FILTER = revMap(FILTER_TO_URL);

const PATH_TO_LEVEL = {
  '/annotations': 'annotation',
  '/datasets': 'dataset'
};

function encodeParams(filter, path) {
  const level = PATH_TO_LEVEL[path];
  let q = {};
  for (var key in FILTER_TO_URL) {
    if (FILTER_SPECIFICATIONS[key].levels.indexOf(level) == -1)
      continue;

    if (filter[key] != DEFAULT_FILTER[key]) {
      q[FILTER_TO_URL[key]] = filter[key] || null;
    }
  }
  console.log(q);
  return q;
}

function decodeParams({query, path}) {
  const level = PATH_TO_LEVEL[path];

  let filter = {};
  for (var key in DEFAULT_FILTER)
    if (FILTER_SPECIFICATIONS[key].levels.indexOf(level) != -1)
      filter[key] = DEFAULT_FILTER[key];

  for (var key in query) {
    const fKey = URL_TO_FILTER[key];
    if (FILTER_SPECIFICATIONS[fKey].levels.indexOf(level) == -1)
      continue;

    if (fKey) {
      filter[fKey] = query[key];
      if (filter[fKey] === null)
        filter[fKey] = undefined;
    }
  }
  return filter;
}

function replaceURL(state, filter) {
  const query = encodeParams(filter, state.route.path);

  state.lastUsedFilters[state.route.path] = {
    filter,
    query,
    order: state.orderedActiveFilters
  };

  router.replace({query});
}

const store = new Vuex.Store({
  state: {
    // names of currently shown filters
    orderedActiveFilters: [],

    // currently selected annotation
    annotation: undefined,

    lastUsedFilters: {}
  },

  getters: {
    filter(state) {
      return decodeParams(state.route);
    },

    gqlAnnotationFilter(state, getters) {
      const filter = getters.filter;
      const f = {
        database: filter.database,
        datasetNamePrefix: filter.datasetName,
        compoundQuery: filter.compoundName,
        adduct: filter.adduct,
        fdrLevel: filter.fdrLevel
      };

      if (filter.minMSM)
        f.msmScoreFilter = {min: filter.minMSM, max: 1.0};

      if (filter.mz) {
        // FIXME: hardcoded ppm
        const ppm = 5, mz = filter.mz;
        f.mzFilter = {
          min: mz * (1.0 - ppm * 1e-6),
          max: mz * (1.0 + ppm * 1e-6)
        };
      }

      return f;
    },

    gqlDatasetFilter(state, getters) {
      const filter = getters.filter;
      const {institution, datasetName, polarity, organism,
             ionisationSource, maldiMatrix} = filter;
      return {
        institution,
        name: datasetName,
        organism,
        ionisationSource,
        maldiMatrix,
        polarity: polarity ? polarity.toUpperCase() : null
      }
    }
  },

  mutations: {
    updateFilter (state, filter) {
      let active = [];

      // drop unset filters
      for (var i = 0; i < state.orderedActiveFilters.length; i++) {
        let key = state.orderedActiveFilters[i];
        if (filter[key] !== undefined)
          active.push(key);
      }

      // append newly added filters to the end
      for (var key in filter)
        if (filter[key] !== undefined &&
            active.indexOf(key) == -1)
          active.push(key);

      state.orderedActiveFilters = active;
      replaceURL(state, filter);
    },

    addFilter (state, name) {
      const {initialValue} = FILTER_SPECIFICATIONS[name];
      // FIXME: is there any way to access getters here?
      let filter = Object.assign(decodeParams(state.route),
                                 {name: initialValue});

      state.orderedActiveFilters.push(name);
      replaceURL(state, filter);
    },

    setAnnotation(state, annotation) {
      state.annotation = annotation;
    }
  }
})

export default store;
