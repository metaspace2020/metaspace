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
  fdrLevel: 0.1
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
  fdrLevel: 'fdrlvl'
};

const URL_TO_FILTER = revMap(FILTER_TO_URL);

function encodeParams(filter) {
  let q = {};
  for (var key in FILTER_TO_URL) {
    if (filter[key] != DEFAULT_FILTER[key]) {
      q[FILTER_TO_URL[key]] = filter[key] || null;
    }
  }
  return q;
}

function decodeParams(query) {
  let filter = Object.assign({}, DEFAULT_FILTER);
  for (var key in query) {
    const fKey = URL_TO_FILTER[key];
    if (fKey) {
      filter[fKey] = query[key];
      if (filter[fKey] === null)
        filter[fKey] = undefined;
    }
  }
  return filter;
}

const store = new Vuex.Store({
  state: {
    // names of currently shown filters
    orderedActiveFilters: [],

    // currently selected annotation
    annotation: undefined
  },

  getters: {
    filter(state) {
      return decodeParams(state.route.query);
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
      router.replace({query: encodeParams(filter)});
    },

    addFilter (state, name) {
      const {initialValue} = FILTER_SPECIFICATIONS[name];
      // FIXME: is there any way to access getters here?
      let filter = Object.assign(decodeParams(state.route.query),
                                 {name: initialValue});

      state.orderedActiveFilters.push(name);
      router.replace({query: encodeParams(filter)});
    },

    setAnnotation(state, annotation) {
      state.annotation = annotation;
    }
  }
})

export default store;
