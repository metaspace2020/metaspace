import { isEqual, omit, without } from 'lodash-es'
import router from '../router'
import compare from '../lib/compare'
import {
  decodeParams,
  encodeParams,
  encodeSections,
  encodeSortOrder,
  FILTER_SPECIFICATIONS,
  getFilterInitialValue,
  stripFilteringParams,
} from '../modules/Filters'
import { DEFAULT_ANNOTATION_VIEW_SECTIONS, DEFAULT_COLORMAP, DEFAULT_TABLE_ORDER } from '../modules/Filters/url'
import { DEFAULT_SCALE_TYPE } from '../lib/constants'

function updatedLocation(state, filter) {
  const query = encodeParams(filter, state.route.path, state.filterLists)

  state.lastUsedFilters[state.route.path] = {
    filter,
    query,
    order: state.orderedActiveFilters,
  }

  return {
    query: Object.assign(query, stripFilteringParams(state.route.query)),
  }
}

function routerReplace(state, params) {
  router.replace(params)
  state.route.path = params.path || state.route.path
  state.route.params = params.params || state.route.params
  state.route.query = params.query || state.route.query
}

function routerPush(state, params) {
  router.push(params)
  state.route.path = params.path || state.route.path
  state.route.params = params.params || state.route.params
  state.route.query = params.query || state.route.query
}

function replaceURL(state, filter) {
  routerReplace(state, updatedLocation(state, filter))
}

function pushURL(state, filter) {
  routerPush(state, updatedLocation(state, filter))
}

function sortFilterKeys(keys) {
  keys.sort((a, b) => compare(FILTER_SPECIFICATIONS[a].sortOrder || 100, FILTER_SPECIFICATIONS[b].sortOrder || 100))
}

function updateFilter(state, filter, routerAction = null) {
  const active = []

  // drop unset filters
  for (let i = 0; i < state.orderedActiveFilters.length; i++) {
    const key = state.orderedActiveFilters[i]
    if (filter[key] !== undefined) active.push(key)
  }

  // append newly added filters to the end
  for (const key in filter) if (filter[key] !== undefined && active.indexOf(key) == -1) active.push(key)

  // sort
  sortFilterKeys(active)

  const changedFilterSet = !isEqual(state.orderedActiveFilters, active)

  state.orderedActiveFilters = active
  if (routerAction === 'push' || (routerAction == null && changedFilterSet)) pushURL(state, filter)
  else replaceURL(state, filter)
}

export default {
  updateRoute(state, route) {
    state.route.path = route.path
    state.route.params = route.params
    state.route.query = route.query
  },

  updateFilter(state, filter) {
    // TODO: Stop using updateFilter for adding/removing filters, as it makes reacting to added/removed filters
    // much more difficult
    updateFilter(state, filter)
  },

  updateCurrentUser(state, user) {
    state.currentUser = user
  },

  setReportError(state) {
    state.reportError = !state.reportError
  },

  replaceFilter(state, filter) {
    updateFilter(state, filter, 'replace')
  },

  addFilter(state, name) {
    const oldFilter = decodeParams(state.route, state.filterLists)
    const filtersToAdd = [name]
    const filtersToRemove = []

    // Check for required additional filters & conflicting filters
    ;(FILTER_SPECIFICATIONS[name].dependsOnFilters || []).forEach((key) => {
      if (oldFilter[key] === undefined) {
        filtersToAdd.push(key)
      }
    })
    ;(FILTER_SPECIFICATIONS[name].conflictsWithFilters || []).forEach((key) => {
      if (oldFilter[key] !== undefined) {
        filtersToRemove.push(key)
      }
    })

    const newFilter = { ...oldFilter }
    filtersToAdd.forEach((key) => {
      newFilter[key] = getFilterInitialValue(key, state.filterLists)
    })
    filtersToRemove.forEach((key) => {
      newFilter[key] = undefined
    })
    const newActive = without([...state.orderedActiveFilters, ...filtersToAdd], ...filtersToRemove)
    sortFilterKeys(newActive)

    state.orderedActiveFilters = newActive
    pushURL(state, newFilter)
  },

  removeFilter(state, name) {
    const oldFilter = decodeParams(state.route, state.filterLists)
    const filtersToRemove = [name]

    // Check for dependent filters that should also be removed
    Object.keys(oldFilter).forEach((key) => {
      const { dependsOnFilters } = FILTER_SPECIFICATIONS[key]
      if (dependsOnFilters != null && dependsOnFilters.includes(name)) {
        filtersToRemove.push(key)
      }
    })

    const newFilter = omit(oldFilter, filtersToRemove)
    state.orderedActiveFilters = without(state.orderedActiveFilters, ...filtersToRemove)
    pushURL(state, newFilter)
  },

  updateFilterOnNavigate(state, to) {
    const newActiveFilters = Object.keys(decodeParams(to, state.filterLists))

    const removed = without(state.orderedActiveFilters, ...newActiveFilters)
    const added = without(newActiveFilters, ...state.orderedActiveFilters)

    state.orderedActiveFilters = without(state.orderedActiveFilters, ...removed)
    state.orderedActiveFilters.push(...added)
    sortFilterKeys(state.orderedActiveFilters)
  },

  setFilterListsLoading(state) {
    state.filterListsLoading = true
  },

  setFilterLists(state, filterLists) {
    state.filterLists = filterLists
    state.filterListsLoading = false
  },

  setAnnotation(state, annotation) {
    state.annotation = annotation
  },

  setNormalizationMatrix(state, normalizationMatrix) {
    state.normalization = normalizationMatrix
  },

  resetChannels(state) {
    state.channels = []
  },

  addChannel(state, { id, annotations, settings }) {
    state.channels.push({ id, annotations, settings })
  },

  restoreChannels(state, channels) {
    state.channels = channels
  },

  removeChannel(state, { index }) {
    const aux = state.channels.slice(0)
    aux.splice(index, 1)
    state.channels = aux
  },

  updateChannel(state, { index, id, annotations, settings }) {
    const aux = state.channels.slice(0)
    aux[index] = { id, annotations, settings }
    state.channels = aux
  },

  setViewerMode(state, mode = 'SINGLE') {
    state.mode = mode
  },

  setRoiInfo(state, { key, roi }) {
    state.roiInfo[key] = roi
  },

  toggleRoiVisibility(state, visible) {
    state.roiInfo['visible'] = visible
  },

  resetRoiInfo(state) {
    // Preserve the visibility state when resetting ROI info
    const currentVisibility = state.roiInfo?.visible || false
    state.roiInfo = { visible: currentVisibility }
  },

  clearRoiData(state) {
    state.roiInfo = { visible: false }
  },

  setSnapshotAnnotationIds(state, annotation) {
    state.snapshotAnnotationIds = annotation
  },

  updateAnnotationTableStatus(state, isLoading) {
    state.tableIsLoading = isLoading
  },

  startTour(state, tourDescription) {
    state.currentTour = tourDescription
  },

  endTour(state) {
    state.currentTour = null
  },

  updateAnnotationViewSections(state, activeSections) {
    const sections = encodeSections(activeSections)
    const defaultSections = encodeSections(DEFAULT_ANNOTATION_VIEW_SECTIONS)
    routerReplace(state, {
      query: sections !== defaultSections ? { ...state.route.query, sections } : omit(state.route.query, 'sections'),
    })
  },

  setColormap(state, cmap) {
    routerReplace(state, {
      query: cmap !== DEFAULT_COLORMAP ? { ...state.route.query, cmap } : omit(state.route.query, 'cmap'),
    })
  },

  setScaleType(state, scaleType) {
    routerReplace(state, {
      query:
        scaleType !== DEFAULT_SCALE_TYPE
          ? { ...state.route.query, scale: scaleType }
          : omit(state.route.query, 'scale'),
    })
  },

  setLockTemplate(state, lockTemplate) {
    routerReplace(state, {
      query: lockTemplate ? { ...state.route.query, lock: lockTemplate } : omit(state.route.query, 'lock'),
    })
  },

  setNormalization(state, normalization) {
    routerReplace(state, {
      query: !normalization ? omit(state.route.query, 'norm') : { ...state.route.query, norm: normalization },
    })
  },

  setCurrentPage(state, page) {
    routerReplace(state, {
      query: page !== 1 ? { ...state.route.query, page: String(page) } : omit(state.route.query, 'page'),
    })
  },

  setRow(state, row) {
    routerReplace(state, {
      query: row !== 1 ? { ...state.route.query, row: String(row) } : omit(state.route.query, 'row'),
    })
  },

  setSortOrder(state, sortOrder) {
    const sort = encodeSortOrder(sortOrder)
    const defaultSort = encodeSortOrder(DEFAULT_TABLE_ORDER)
    routerReplace(state, {
      query: sort !== defaultSort ? { ...state.route.query, sort } : omit(state.route.query, 'sort'),
    })
  },

  setColocalizationAlgo(state, colocalizationAlgo) {
    routerReplace(state, {
      query:
        colocalizationAlgo != null ? { ...state.route.query, alg: colocalizationAlgo } : omit(state.route.query, 'alg'),
    })
  },

  setDatasetTab(state, tab) {
    const path = {
      list: '/datasets',
      summary: '/datasets/summary',
    }[tab.toLowerCase()]
    routerReplace(state, {
      path,
      query: state.route.query,
    })
  },

  setThemeVariant(state, variant) {
    state.theme.variant = variant
    // Update CSS custom properties for dynamic theming
    if (typeof document !== 'undefined') {
      // Define theme colors in ONE place
      const themeColors = {
        default: {
          primary: '#409eff',
          primaryAlpha: 'rgba(64, 158, 255, 0.87)',
          primaryDark: '#337ecc',
          bgLight: '#ecf5ff',
          borderLight: 'rgba(64, 158, 255, 0.2)',
          // Element Plus shades
          light3: '#79bbff',
          light5: '#a0cfff',
          light7: '#c6e2ff',
          light8: '#d9ecff',
          light9: '#ecf5ff',
        },
        pro: {
          primary: '#FFAB3F', // ⭐ CHANGE THIS COLOR HERE - single source of truth!
          primaryAlpha: 'rgba(255, 171, 63, 0.87)',
          primaryDark: '#E89A33',
          bgLight: '#FFF5E6',
          borderLight: 'rgba(255, 171, 63, 0.2)',
          // Element Plus shades
          light3: '#FFBF66',
          light5: '#FFD08C',
          light7: '#FFE1B3',
          light8: '#FFECC6',
          light9: '#FFF5E6',
        },
      }

      const colors = variant === 'pro' ? themeColors.pro : themeColors.default

      // Apply all colors from the single source
      document.documentElement.style.setProperty('--color-primary', colors.primary)
      document.documentElement.style.setProperty('--primary-color', colors.primary)
      document.documentElement.style.setProperty('--primary-color-alpha', colors.primaryAlpha)
      document.documentElement.style.setProperty('--primary-color-dark', colors.primaryDark)
      document.documentElement.style.setProperty('--primary-bg-light', colors.bgLight)
      document.documentElement.style.setProperty('--primary-border-light', colors.borderLight)
      // Element Plus colors
      document.documentElement.style.setProperty('--el-color-primary', colors.primary)
      document.documentElement.style.setProperty('--el-color-primary-light-3', colors.light3)
      document.documentElement.style.setProperty('--el-color-primary-light-5', colors.light5)
      document.documentElement.style.setProperty('--el-color-primary-light-7', colors.light7)
      document.documentElement.style.setProperty('--el-color-primary-light-8', colors.light8)
      document.documentElement.style.setProperty('--el-color-primary-light-9', colors.light9)
      document.documentElement.style.setProperty('--el-color-primary-dark-2', colors.primaryDark)
    }
  },
}
