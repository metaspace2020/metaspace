import FILTER_SPECIFICATIONS from './filterSpecs.js';
import {encodeParams, decodeParams} from './filterToUrl.js';
import router from './router.js';

import Vue from 'vue';
import Vuex from 'vuex';
Vue.use(Vuex);


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

    // is annotation table loading?
    tableIsLoading: true,

    lastUsedFilters: {},

    authenticated: false,
    user: null
  },

  getters: {
    filter(state) {
      return decodeParams(state.route);
    },

    gqlAnnotationFilter(state, getters) {
      const filter = getters.filter;
      const f = {
        database: filter.database,
        datasetName: filter.datasetName,
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
    },

    updateAnnotationTableStatus(state, isLoading) {
      state.tableIsLoading = isLoading;
    },

    login(state, user) {
      state.authenticated = true;
      state.user = user;
    },

    logout(state) {
      state.authenticated = false;
      state.user = null;
    }
  }
})

export default store;
