import router from '../router';

import {decodeParams,
        encodeParams, encodeSections, encodeSortOrder,
        stripFilteringParams} from '../url';
import {getFilterInitialValue} from '../filterSpecs';
import tokenAutorefresh from '../tokenAutorefresh';
import {decodePayload} from '../util';


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
  replaceURL(state, filter);
  return;

  // TODO: add router hook to update orderedActiveFilters
  router.push(updatedLocation(state, filter));
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

    const changedFilterSet = state.orderedActiveFilters != active;

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

  setUser(state, user) {
    state.authenticated = user != null && user.role !== 'anonymous';
    state.user = user;
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
    let query = Object.assign({}, state.route.query, {page: page + 1});
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
