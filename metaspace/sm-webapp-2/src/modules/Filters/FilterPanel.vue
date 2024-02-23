<template>
  <div class="filter-panel">
    <el-select
      v-if="anyOptionalFilterPresent"
      :value="selectedFilterToAdd"
      class="filter-select"
      placeholder="Add filter"
      @change="addFilter"
      size="large"
    >
      <el-option v-for="f in availableFilters" :key="f.key" :value="f.key" :label="f.description" />
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
import { defineComponent, computed, ref, watch, onMounted } from 'vue'
import { useStore } from 'vuex'
import { FILTER_COMPONENT_PROPS, FILTER_SPECIFICATIONS } from './filterSpecs'
import { isFunction, pick, get, uniq } from 'lodash-es'
import { setLocalStorage } from '../../lib/localStorage'
import { ElSelect, ElOption } from '../../lib/element-plus'

import { inject } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'

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

const dsAnnotationHiddenFilters = ['datasetIds']

const filterComponents = {}
Object.keys(FILTER_SPECIFICATIONS).reduce((accum, cur) => {
  const componentType = FILTER_SPECIFICATIONS[cur].type
  if (!componentType.name && !(componentType.options && componentType.options.name)) {
    throw new Error('Missing name in FILTER_SPECIFICATIONS component type')
  }
  const typeName = 'options' in componentType ? componentType.options.name : componentType.name
  if (!(typeName in accum)) {
    accum[typeName] = componentType
  }
  return accum
}, filterComponents)

export default defineComponent({
  name: 'filter-panel',
  components: {
    ...filterComponents,
    ElSelect,
    ElOption,
  },
  props: ['level', 'simpleFilterOptions', 'setDatasetOwnerOptions', 'hiddenFilters', 'fixedOptions'],
  setup(props) {
    const apolloClient = inject(DefaultApolloClient)
    const store = useStore()
    const selectedFilterToAdd = ref(null)

    onMounted(async () => {
      await store.dispatch('initFilterLists', apolloClient)
    })

    const storeFilter = computed(() => store.getters.filter)
    const activeKeys = computed(() => {
      return uniq(
        store.state.orderedActiveFilters.map((filterKey) =>
          get(FILTER_SPECIFICATIONS, [filterKey, 'multiFilterParent'], filterKey)
        )
      )
    })

    const visibleFilters = computed(() => {
      return activeKeys.value.filter(shouldShowFilter).map(makeFilter)
    })

    const availableFilters = computed(() => {
      const available = []
      for (const key of orderedFilterKeys) {
        const filterSpec = FILTER_SPECIFICATIONS[key]
        if (
          filterSpec.levels.includes(props.level) &&
          !activeKeys.value.includes(key) &&
          (filterSpec.hidden == null ||
            filterSpec.hidden === false ||
            (isFunction(filterSpec.hidden) && !filterSpec.hidden()))
        ) {
          available.push({ key, description: filterSpec.description })
        }
      }
      return available
    })

    const anyOptionalFilterPresent = computed(() => {
      for (const filter of availableFilters.value) {
        if (!('removable' in FILTER_SPECIFICATIONS[filter.key]) || FILTER_SPECIFICATIONS[filter.key].removable) {
          return true
        }
      }
      return false
    })

    watch(
      () => props.simpleFilterOptions,
      (newVal) => {
        // Remove simpleFilter if it has a value that's no longer selectable
        if (
          storeFilter.value.simpleFilter != null &&
          (newVal == null || !newVal.some((opt) => opt.value === storeFilter.value.simpleFilter))
        ) {
          store.commit('updateFilter', { ...storeFilter.value, simpleFilter: null })
        }
      }
    )

    watch(
      () => props.setDatasetOwnerOptions,
      (newVal) => {
        if (
          storeFilter.value.datasetOwner != null &&
          (newVal == null || !newVal.some((opt) => opt.value === storeFilter.value.datasetOwner))
        ) {
          store.commit('updateFilter', { ...storeFilter.value, datasetOwner: null })
        }
      }
    )

    function shouldShowFilter(filterKey) {
      const { hidden } = FILTER_SPECIFICATIONS[filterKey]
      if (typeof hidden === 'function' ? hidden() : hidden != null && hidden) {
        return false
      }
      if (filterKey === 'simpleFilter') {
        return props.simpleFilterOptions != null
      }
      if (props.level === 'dataset-annotation' && dsAnnotationHiddenFilters.includes(filterKey)) {
        return false
      }
      if (props.hiddenFilters && props.hiddenFilters.includes(filterKey)) {
        return false
      }
      if (filterKey === 'datasetOwner') {
        return props.setDatasetOwnerOptions != null
      }
      return true
    }

    function makeFilter(filterKey) {
      const filterSpec = FILTER_SPECIFICATIONS[filterKey]
      const { type, isMultiFilter, ...attrs } = filterSpec

      if (isMultiFilter) {
        return {
          filterKey,
          type,
          onChange: (val, _filterKey) => {
            store.commit('updateFilter', Object.assign(storeFilter.value, { [_filterKey]: val }))
          },
          onDestroy: (_filterKey) => {
            store.commit('removeFilter', _filterKey)
          },
          attrs: {
            ...pick(attrs, FILTER_COMPONENT_PROPS),
            filterValues: storeFilter.value,
          },
        }
      } else {
        return {
          filterKey,
          type,
          // passing the value of undefined destroys the tag element
          onChange: (val) => {
            const { datasetOwner, submitter, group } = storeFilter.value
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
            if (filterKey === 'datasetOwner' || 'datasetOwner' in extraUpdatesAux) {
              const dsValue = 'datasetOwner' in extraUpdatesAux ? extraUpdatesAux.datasetOwner : val
              setLocalStorage(filterKey, dsValue)
            }

            // update simpleFilter settings
            if (filterKey === 'simpleFilter') {
              setLocalStorage(filterKey, val)
            }

            store.commit('updateFilter', Object.assign(storeFilter.value, { [filterKey]: val, ...extraUpdatesAux }))
          },
          onDestroy: () => {
            if (filterKey === 'annotationIds') {
              store.commit('setFilterLists', {
                ...store.state.filterLists,
                annotationIds: computed(() => undefined),
              })
            }
            store.commit('removeFilter', filterKey)
          },
          attrs: {
            ...pick(attrs, FILTER_COMPONENT_PROPS),
            value: getFilterValue(filterSpec, filterKey),
            fixedOptions: getFixedOptions(filterSpec, filterKey),
            options: getFilterOptions(filterSpec, filterKey),
          },
        }
      }
    }

    function addFilter(key) {
      if (key) {
        selectedFilterToAdd.value = null
        store.commit('addFilter', key)
      }
    }

    function getFixedOptions(filter, filterKey) {
      if (props.fixedOptions && Object.keys(props.fixedOptions).includes(filterKey)) {
        return props.fixedOptions[filterKey]
      }
      return undefined
    }

    function getFilterOptions(filter, filterKey) {
      const { filterLists } = store.state
      // dynamically generated options are supported:
      // either specify a function of optionLists or one of its field names
      if (filterKey === 'simpleFilter') {
        return props.simpleFilterOptions
      }
      if (filterKey === 'datasetOwner') {
        return props.setDatasetOwnerOptions
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
    }

    function getFilterValue(filter, filterKey) {
      const value = storeFilter.value[filterKey]
      if (filter.convertValueForComponent) {
        return filter.convertValueForComponent(value)
      }
      return value
    }

    return {
      filter: storeFilter,
      activeKeys,
      selectedFilterToAdd,
      visibleFilters,
      availableFilters,
      anyOptionalFilterPresent,
      addFilter,
      getFixedOptions,
      getFilterOptions,
      getFilterValue,
      makeFilter,
      shouldShowFilter,
    }
  },
})
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
