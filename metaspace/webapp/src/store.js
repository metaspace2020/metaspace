import FILTER_SPECIFICATIONS from './filterSpecs.js';
import {encodeParams, decodeParams, stripFilteringParams} from './filterToUrl.js';
import router from './router.js';

import Vue from 'vue';
import Vuex from 'vuex';
Vue.use(Vuex);

const allSections = ['images', 'compounds', 'scores', 'metadata'].reverse();

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

function encodeSections(sections) {
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

function encodeSortOrder({by, dir}) {
  let sort = dir == 'ASCENDING' ? '' : '-';
  return sort + by.replace('ORDER_BY_', '').toLowerCase();
}

function decodeSettings({query, path}) {
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
    }
  };

  if (query.page)
    settings.table.currentPage = query.page - 1;
  if (query.sort)
    settings.table.order = decodeSortOrder(query.sort);
  if (query.cmap)
    settings.annotationView.colormap = query.cmap;
  if (query.show !== undefined)
    settings.annotationView.activeSections = decodeSections(query.show);
  return settings;
}

function updatedLocation(state, filter) {
  let query = encodeParams(filter, state.route.path);

  state.lastUsedFilters[state.route.path] = {
    filter,
    query,
    order: state.orderedActiveFilters
  };

  return {
    query: Object.assign(query, stripFilteringParams(state.route.query))
  };
}

function replaceURL(state, filter) {
  router.replace(updatedLocation(state, filter));
}

function pushURL(state, filter) {
  replaceURL(state, filter);
  return;

  // TODO: add router hook to update orderedActiveFilters
  router.push(updatedLocation(state, filter));
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
    user: null,

    currentTour: null
  },

  getters: {
    filter(state) {
      return decodeParams(state.route);
    },

    settings(state) {
      return decodeSettings(state.route);
    },

    gqlAnnotationFilter(state, getters) {
      const filter = getters.filter;
      const f = {
        database: filter.database,
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
      const {institution, datasetIds, polarity, organism,
             ionisationSource, maldiMatrix} = filter;
      return {
        institution,

        // temporary workaround because of array-related bugs in apollo-client
        ids: datasetIds ? datasetIds.join("|") : null,

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

      const changedFilterSet = state.orderedActiveFilters != active;

      state.orderedActiveFilters = active;
      if (changedFilterSet)
        pushURL(state, filter);
      else
        replaceURL(state, filter);
    },

    addFilter (state, name) {
      const {initialValue} = FILTER_SPECIFICATIONS[name];
      // FIXME: is there any way to access getters here?
      let filter = Object.assign(decodeParams(state.route),
                                 {name: initialValue});

      state.orderedActiveFilters.push(name);
      pushURL(state, filter);
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
    },

    startTour(state, tourDescription) {
      state.currentTour = tourDescription;
    },

    endTour(state) {
      state.currentTour = null;
    },

    updateAnnotationViewSections(state, activeSections) {
      let query = Object.assign({}, state.route.query, {
        show: encodeSections(activeSections)
      });
      router.replace({query});
    },

    setColormap(state, colormap) {
      let query = Object.assign({}, state.route.query, {
        cmap: colormap
      });
      router.replace({query});
    },

    setCurrentPage(state, page) {
      let query = Object.assign({}, state.route.query, {page: page + 1});
      router.replace({query});
    },

    setSortOrder(state, sortOrder) {
      let query = Object.assign({}, state.route.query, {
        sort: encodeSortOrder(sortOrder)
      });
      router.replace({query});
    }
  }
})

export default store;
