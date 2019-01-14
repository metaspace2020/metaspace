import {isEqual, omit, pull, without} from 'lodash-es';
import router from '../router';
import compare from '../lib/compare';

import {
  decodeParams,
  encodeParams,
  encodeSections,
  encodeSortOrder,
  FILTER_SPECIFICATIONS,
  getFilterInitialValue,
  stripFilteringParams,
} from '../modules/Filters';
import {DEFAULT_ANNOTATION_VIEW_SECTIONS, DEFAULT_COLORMAP, DEFAULT_TABLE_ORDER} from '../modules/Filters/url';


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

function updateFilter(state, filter, routerAction = null) {
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
  if (routerAction === 'push' || (routerAction == null && changedFilterSet))
    pushURL(state, filter);
  else
    replaceURL(state, filter);
}

export default {
  updateFilter (state, filter) {
    updateFilter(state, filter);
  },

  replaceFilter (state, filter) {
    updateFilter(state, filter, 'replace');
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
    const sections = encodeSections(activeSections);
    const defaultSections = encodeSections(DEFAULT_ANNOTATION_VIEW_SECTIONS);
    router.replace({
      query: sections !== defaultSections
        ? { ...state.route.query, sections }
        : omit(state.route.query, 'sections'),
    });
  },

  setColormap(state, cmap) {
    router.replace({
      query: cmap !== DEFAULT_COLORMAP
        ? {...state.route.query, cmap}
        : omit(state.route.query, 'cmap'),
    });
  },

  setCurrentPage(state, page) {
    router.replace({
      query: page !== 1
        ? { ...state.route.query, page }
        : omit(state.route.query, 'page'),
    });
  },

  setSortOrder(state, sortOrder) {
    const sort = encodeSortOrder(sortOrder);
    const defaultSort = encodeSortOrder(DEFAULT_TABLE_ORDER);
    router.replace({
      query: sort !== defaultSort
        ? { ...state.route.query, sort }
        : omit(state.route.query, 'sort'),
    });
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
