import {isEqual, pull, without} from 'lodash-es';
import router from '../router';
import compare from '../lib/compare';

import {
  decodeParams,
  encodeParams, encodeSections, encodeSortOrder, FILTER_SPECIFICATIONS,
  stripFilteringParams,
} from '../modules/Filters';
import {getFilterInitialValue} from '../modules/Filters';


function updatedLocation(state, filter) {
  let query = encodeParams(filter, state.route.path, state.filterLists);

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
  router.push(updatedLocation(state, filter));
}

function sortFilterKeys(keys) {
  keys.sort((a, b) => compare(FILTER_SPECIFICATIONS[a].sortOrder || 100, FILTER_SPECIFICATIONS[b].sortOrder || 100));
}

export default {
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

    // sort
    sortFilterKeys(active);

    const changedFilterSet = !isEqual(state.orderedActiveFilters, active);

    state.orderedActiveFilters = active;
    if (changedFilterSet)
      pushURL(state, filter);
    else
      replaceURL(state, filter);
  },

  addFilter (state, name) {
    const initialValue = getFilterInitialValue(name, state.filterLists);

    // FIXME: is there any way to access getters here?
    let filter = Object.assign(decodeParams(state.route, state.filterLists),
                               {[name]: initialValue});

    state.orderedActiveFilters.push(name);
    pushURL(state, filter);
  },

  updateFilterOnNavigate(state, to) {
    const newActiveFilters = Object.keys(decodeParams(to, state.filterLists));

    const removed = without(state.orderedActiveFilters, ...newActiveFilters);
    const added = without(newActiveFilters, ...state.orderedActiveFilters);

    pull(state.orderedActiveFilters, ...removed);
    state.orderedActiveFilters.push(...added);
    sortFilterKeys(state.orderedActiveFilters);
  },

  setFilterListsLoading(state) {
    state.filterListsLoading = true;
  },

  setFilterLists(state, filterLists) {
    state.filterLists = filterLists;
    state.filterListsLoading = false;
  },

  setAnnotation(state, annotation) {
    state.annotation = annotation;
  },

  updateAnnotationTableStatus(state, isLoading) {
    state.tableIsLoading = isLoading;
  },

  startTour(state, tourDescription) {
    state.currentTour = tourDescription;
  },

  endTour(state) {
    state.currentTour = null;
  },

  updateAnnotationViewSections(state, activeSections) {
    let query = Object.assign({}, state.route.query, {
      sections: encodeSections(activeSections)
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
    let query = Object.assign({}, state.route.query, {page});
    router.replace({query});
  },

  setSortOrder(state, sortOrder) {
    let query = Object.assign({}, state.route.query, {
      sort: encodeSortOrder(sortOrder)
    });
    router.replace({query});
  },

  setDatasetTab(state, tab) {
    const path = {
      'list': '/datasets',
      'summary': '/datasets/summary'
    }[tab.toLowerCase()];
    router.replace({
      path,
      query: state.route.query,
    });
  }
};
