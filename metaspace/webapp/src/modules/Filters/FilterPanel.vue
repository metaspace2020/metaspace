<template>
  <div class="filter-panel">
    <el-select
      v-if="anyOptionalFilterPresent"
      v-model="selectedFilterToAdd"
      class="filter-select"
      placeholder="Add filter"
      @change="addFilter"
    >
      <el-option
        v-for="f in availableFilters"
        :key="f.key"
        :value="f.key"
        :label="f.description"
      />
    </el-select>

    <component
      :is="f.type"
      v-for="f in visibleFilters"
      :key="f.filterKey"
      :data-test-key="f.filterKey"
      :filter-key="f.filterKey"
      v-bind="f.attrs"
      @change="f.onChange"
      @destroy="f.onDestroy"
    />
  </div>
</template>

<script>
import { FILTER_COMPONENT_PROPS, FILTER_SPECIFICATIONS } from './filterSpecs'
import { isFunction, pick, get, uniq } from 'lodash-es'
import { setLocalStorage } from '../../lib/localStorage'
import { computed } from '@vue/composition-api'

const orderedFilterKeys = [
  'database',
  'fdrLevel',
  'group',
  'project',
  'submitter',
  'datasetIds',
  'compoundName',
  'mz',
  'offSample',
  'polarity',
  'adduct',
  'organism',
  'organismPart',
  'condition',
  'growthConditions',
  'analyzerType',
  'ionisationSource',
  'maldiMatrix',
  'minMSM',
  'simpleQuery',
  'simpleFilter',
  'datasetOwner',
  'metadataType',
  'molClass',
  'opticalImage',
  'pValue',
]

const dsAnnotationHiddenFilters = [
  'datasetIds',
]

const filterComponents = {}
Object.keys(FILTER_SPECIFICATIONS).reduce((accum, cur) => {
  const componentType = FILTER_SPECIFICATIONS[cur].type
  // a bit hacky way of getting component name b/c of different ways of initialization
  if (!componentType.name && !(componentType.options && componentType.options.name)) {
    throw new Error('Missing name in FILTER_SPECIFICATIONS component type')
  }
  const typeName = ('options' in componentType) ? componentType.options.name : componentType.name
  if (!(typeName in accum)) {
    accum[typeName] = componentType
  }
  return accum
}, filterComponents)

/** @type {ComponentOptions<Vue> & Vue} */
const FilterPanel = {
  name: 'filter-panel',
  props: ['level', 'simpleFilterOptions', 'setDatasetOwnerOptions', 'hiddenFilters', 'fixedOptions'],
  components: filterComponents,
  mounted() {
    this.$store.dispatch('initFilterLists')
  },
  computed: {
    filter() {
      return this.$store.getters.filter
    },

    activeKeys() {
      // For multi-filters, override child filters with their specified parent filter, preventing duplicates
      const keys = this.$store.state.orderedActiveFilters
        .map(filterKey => get(FILTER_SPECIFICATIONS, [filterKey, 'multiFilterParent'], filterKey))

      return uniq(keys)
    },

    visibleFilters() {
      return this.activeKeys
        .filter(this.shouldShowFilter)
        .map(this.makeFilter)
    },

    availableFilters() {
      const available = []
      for (const key of orderedFilterKeys) {
        const filterSpec = FILTER_SPECIFICATIONS[key]
        if (filterSpec.levels.includes(this.level)
           && !this.activeKeys.includes(key)
           && (filterSpec.hidden == null || filterSpec.hidden === false
             || (isFunction(filterSpec.hidden) && !filterSpec.hidden()))) {
          available.push({ key, description: filterSpec.description })
        }
      }
      return available
    },

    anyOptionalFilterPresent() {
      for (const filter of this.availableFilters) {
        if (!('removable' in FILTER_SPECIFICATIONS[filter.key]) || FILTER_SPECIFICATIONS[filter.key].removable) {
          return true
        }
      }
      return false
    },
  },

  watch: {
    simpleFilterOptions(newVal) {
      // Remove simpleFilter if it has a value that's no longer selectable
      if (this.filter.simpleFilter != null
         && (newVal == null || !newVal.some(opt => opt.value === this.filter.simpleFilter))) {
        this.$store.commit('updateFilter', { ...this.filter, simpleFilter: null })
      }
    },
    setDatasetOwnerOptions(newVal) {
      if (this.filter.datasetOwner != null
        && (newVal == null || !newVal.some(opt => opt.value === this.filter.datasetOwner))) {
        this.$store.commit('updateFilter', { ...this.filter, datasetOwner: null })
      }
    },
  },

  data() {
    return {
      selectedFilterToAdd: null,
    }
  },

  methods: {
    shouldShowFilter(filterKey) {
      const { hidden } = FILTER_SPECIFICATIONS[filterKey]
      if (typeof hidden === 'function' ? hidden() : (hidden != null && hidden)) {
        return false
      }
      if (filterKey === 'simpleFilter') {
        return this.simpleFilterOptions != null
      }
      if (this.level === 'dataset-annotation' && dsAnnotationHiddenFilters.includes(filterKey)) {
        return false
      }
      if (this.hiddenFilters && this.hiddenFilters.includes(filterKey)) {
        return false
      }
      if (filterKey === 'datasetOwner') {
        return this.setDatasetOwnerOptions != null
      }
      return true
    },

    makeFilter(filterKey) {
      const filterSpec = FILTER_SPECIFICATIONS[filterKey]
      const { type, isMultiFilter, ...attrs } = filterSpec

      if (isMultiFilter) {
        return {
          filterKey,
          type,
          onChange: (val, _filterKey) => {
            this.$store.commit('updateFilter',
              Object.assign(this.filter, { [_filterKey]: val }))
          },
          onDestroy: (_filterKey) => {
            this.$store.commit('removeFilter', _filterKey)
          },
          attrs: {
            ...pick(attrs, FILTER_COMPONENT_PROPS),
            filterValues: this.filter,
          },
        }
      } else {
        return {
          filterKey,
          type,
          // passing the value of undefined destroys the tag element
          onChange: (val) => {
            const { datasetOwner, submitter, group } = this.filter
            const extraUpdatesAux = {}

            // unset conflicting group filters
            if (filterKey === 'group' && datasetOwner && datasetOwner !== 'my-datasets') {
              extraUpdatesAux.datasetOwner = null
            } else if (filterKey === 'datasetOwner' && group !== undefined && val && val !== 'my-datasets') {
              extraUpdatesAux.group = null
            }

            // unset conflicting submitter id filters
            if (filterKey === 'submitter' && datasetOwner === 'my-datasets') {
              extraUpdatesAux.datasetOwner = null
            } else if (filterKey === 'datasetOwner' && submitter !== undefined && val === 'my-datasets') {
              extraUpdatesAux.submitter = undefined
            }

            // update datasetOwner settings
            if (filterKey === 'datasetOwner' || ('datasetOwner' in extraUpdatesAux)) {
              const dsValue = ('datasetOwner' in extraUpdatesAux)
                ? extraUpdatesAux.datasetOwner : val
              setLocalStorage(filterKey, dsValue)
            }

            // update simpleFilter settings
            if (filterKey === 'simpleFilter') {
              setLocalStorage(filterKey, val)
            }

            this.$store.commit('updateFilter',
              Object.assign(this.filter, { [filterKey]: val, ...extraUpdatesAux }))
          },
          onDestroy: () => {
            if (filterKey === 'annotationIds') {
              this.$store.commit('setFilterLists', {
                ...this.$store.state.filterLists,
                annotationIds: computed(() => undefined),
              })
            }
            this.$store.commit('removeFilter', filterKey)
          },
          attrs: {
            ...pick(attrs, FILTER_COMPONENT_PROPS),
            value: this.getFilterValue(filterSpec, filterKey),
            fixedOptions: this.getFixedOptions(filterSpec, filterKey),
            options: this.getFilterOptions(filterSpec, filterKey),
          },
        }
      }
    },

    addFilter(key) {
      if (key) {
        this.selectedFilterToAdd = null
        this.$store.commit('addFilter', key)
      }
    },

    getFixedOptions(filter, filterKey) {
      if (this.fixedOptions && Object.keys(this.fixedOptions).includes(filterKey)) {
        return this.fixedOptions[filterKey]
      }
      return undefined
    },

    getFilterOptions(filter, filterKey) {
      const { filterLists } = this.$store.state

      // dynamically generated options are supported:
      // either specify a function of optionLists or one of its field names
      if (filterKey === 'simpleFilter') {
        return this.simpleFilterOptions
      }
      if (filterKey === 'datasetOwner') {
        return this.setDatasetOwnerOptions
      }
      if (typeof filter.options === 'object') {
        return filter.options
      }
      if (filterLists == null) {
        return []
      }
      if (typeof filter.options === 'string') {
        return filterLists[filter.options]
      } else if (typeof filter.options === 'function') {
        return filter.options(filterLists)
      }
      return []
    },

    getFilterValue(filter, filterKey) {
      const value = this.filter[filterKey]
      if (filter.convertValueForComponent) {
        return filter.convertValueForComponent(value)
      }
      return value
    },
  },
}
export default FilterPanel
</script>

<style>
 .filter-panel {
   display: inline-flex;
   align-items: flex-start;
   flex-wrap: wrap;
   margin: -5px -5px 5px; /* Remove margins of .tf-outer so that they're properly aligned. Add margin to bottom to fit well with other components */
 }

 .filter-select {
   width: 200px;
   margin: 5px;
 }

 .el-select-dropdown__wrap {
   /* so that no scrolling is necessary */
    max-height: 500px;
 }
</style>
