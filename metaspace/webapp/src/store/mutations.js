import { isEqual, omit, without } from 'lodash-es';
import router from '../router';
import compare from '../lib/compare';
import store from "../store/index";
import {
  decodeParams,
  encodeParams,
  encodeSections,
  encodeSortOrder,
  FILTER_SPECIFICATIONS,
  getFilterInitialValue,
  stripFilteringParams,
} from '../modules/Filters';
import { DEFAULT_ANNOTATION_VIEW_SECTIONS, DEFAULT_COLORMAP, DEFAULT_TABLE_ORDER } from '../modules/Filters/url';
import { DEFAULT_SCALE_TYPE } from '../lib/constants';
import Vue from 'vue'

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
  updateFilter(state, filter) {
    // TODO: Stop using updateFilter for adding/removing filters, as it makes reacting to added/removed filters
    // much more difficult
    updateFilter(state, filter);
  },

  updateCurrentUser(state, user) {
    state.currentUser = user
  },

  replaceFilter(state, filter) {
    updateFilter(state, filter, 'replace');
  },

  addFilter(state, name) {
    const oldFilter = decodeParams(state.route, state.filterLists);
    const filtersToAdd = [name];
    const filtersToRemove = [];

    // Check for required additional filters & conflicting filters
    (FILTER_SPECIFICATIONS[name].dependsOnFilters || []).forEach(key => {
      if (oldFilter[key] === undefined) {
        filtersToAdd.push(key);
      }
    });
    (FILTER_SPECIFICATIONS[name].conflictsWithFilters || []).forEach(key => {
      if (oldFilter[key] !== undefined) {
        filtersToRemove.push(key);
      }
    });

    const newFilter = { ...oldFilter };
    filtersToAdd.forEach(key => {
      newFilter[key] = getFilterInitialValue(key, state.filterLists);
    });
    filtersToRemove.forEach(key => {
      newFilter[key] = undefined;
    });
    const newActive = without([...state.orderedActiveFilters, ...filtersToAdd], ...filtersToRemove);
    sortFilterKeys(newActive);

    state.orderedActiveFilters = newActive;
    pushURL(state, newFilter);
  },

  removeFilter(state, name) {
    const oldFilter = decodeParams(state.route, state.filterLists);
    const filtersToRemove = [name];

    // Check for dependent filters that should also be removed
    Object.keys(oldFilter).forEach(key => {
      const { dependsOnFilters } = FILTER_SPECIFICATIONS[key];
      if (dependsOnFilters != null && dependsOnFilters.includes(name)) {
        filtersToRemove.push(key);
      }
    });

    const newFilter = omit(oldFilter, filtersToRemove);
    state.orderedActiveFilters = without(state.orderedActiveFilters, ...filtersToRemove);
    pushURL(state, newFilter);
  },

  updateFilterOnNavigate(state, to) {
    const newActiveFilters = Object.keys(decodeParams(to, state.filterLists));

    const removed = without(state.orderedActiveFilters, ...newActiveFilters);
    const added = without(newActiveFilters, ...state.orderedActiveFilters);

    state.orderedActiveFilters = without(state.orderedActiveFilters, ...removed);
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

  setNormalizationMatrix(state, normalizationMatrix) {
    state.normalization = normalizationMatrix;
  },

  resetChannels(state) {
    state.channels = [];
  },

  addChannel(state, {id, annotations, settings}) {
    state.channels.push({id, annotations, settings});
  },

  restoreChannels(state, channels) {
    state.channels = channels;
  },

  removeChannel(state, {index}) {
    const aux = state.channels.slice(0)
    aux.splice(index, 1)
    state.channels = aux
  },

  updateChannel(state, {index, id, annotations, settings}) {
    const aux = state.channels.slice(0)
    aux[index] = {id, annotations, settings}
    state.channels = aux
  },

  setViewerMode(state, mode = 'SINGLE') {
    state.mode = mode;
  },


  setRoiInfo(state, {key, roi}) {
    Vue.set(state.roiInfo, key, roi)
  },

  toggleRoiVisibility(state, visible) {
    Vue.set(state.roiInfo, 'visible', visible)
  },

  resetRoiInfo(state) {
    state.roiInfo = {visible: false};
  },

  setSnapshotAnnotationIds(state, annotation) {
    state.snapshotAnnotationIds = annotation;
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
        ? { ...state.route.query, cmap }
        : omit(state.route.query, 'cmap'),
    });
  },

  setScaleType(state, scaleType) {
    router.replace({
      query: scaleType !== DEFAULT_SCALE_TYPE
        ? { ...state.route.query, scale: scaleType }
        : omit(state.route.query, 'scale'),
    });
  },

  setLockTemplate(state, lockTemplate) {
    router.replace({
      query: lockTemplate
        ? { ...state.route.query, lock: lockTemplate }
        : omit(state.route.query, 'lock'),
    });
  },

  setNormalization(state, normalization) {
    router.replace({
      query: !normalization ? omit(state.route.query, 'norm')
        : {...state.route.query, norm: normalization }
    });
  },

  setCurrentPage(state, page) {
    router.replace({
      query: page !== 1
        ? { ...state.route.query, page: String(page) }
        : omit(state.route.query, 'page'),
    });
  },

  setRow(state, row) {
    router.replace({
      query: row !== 1
        ? { ...state.route.query, row: String(row) }
        : omit(state.route.query, 'row'),
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

  setColocalizationAlgo(state, colocalizationAlgo) {
    router.replace({
      query: colocalizationAlgo != null
        ? { ...state.route.query, alg: colocalizationAlgo }
        : omit(state.route.query, 'alg'),
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
