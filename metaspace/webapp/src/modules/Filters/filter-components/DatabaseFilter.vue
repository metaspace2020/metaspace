<template>
  <tag-filter name="Database" :removable="false" :width="300" @destroy="destroy">
    <template v-slot:edit>
      <el-select
        ref="selectRef"
        class="w-full"
        placeholder="Start typing name"
        :clearable="false"
        filterable
        :filter-method="filterOptions"
        no-data-text="No matches"
        no-match-text="No matches"
        reserve-keyword
        :value="valueIfKnown"
        @change="onInput"
        @visible-change="filterOptions('')"
      >
        <el-option-group v-for="group in groups" :key="group.label" :label="group.label">
          <el-option
            v-for="option in group.options"
            :key="option.value"
            class="flex"
            :value="option.value"
            :label="option.label"
          >
            <span class="truncate" :title="option.label">
              {{ option.label }}
            </span>
            <span
              v-if="option.archived"
              data-archived-badge
              class="bg-gray-100 text-gray-700 text-xs tracking-wide font-normal my-auto ml-auto leading-6 h-6 px-3 rounded-full"
            >
              Archived
            </span>
          </el-option>
        </el-option-group>
      </el-select>
      <filter-help-text v-if="hasDatasetFilter" icon="time">
        Showing results from selected dataset{{ datasetFilter.length > 1 ? 's' : '' }}
      </filter-help-text>
      <filter-help-text v-else> Search to see archived versions </filter-help-text>
    </template>
    <template v-slot:show>
      <span v-if="initialized" class="tf-value-span">
        {{ label }}
      </span>
      <el-icon v-else class="is-loading"><Loading /></el-icon>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue'
import { useStore } from 'vuex'
import { sortBy } from 'lodash-es'
import gql from 'graphql-tag'

import TagFilter from './TagFilter.vue'
import { FilterHelpText } from './TagFilterComponents'
import { MolecularDB } from '../../../api/moldb'
import { formatDatabaseLabel, getDatabasesByGroup } from '../../MolecularDatabases/formatting'

import { inject, InjectionKey } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { ApolloClient } from '@apollo/client/core'
import { Loading } from '@element-plus/icons-vue'
import { ElSelect, ElOption, ElOptionGroup } from '../../../lib/element-plus'

interface Option {
  value: string
  label: string
  archived: Boolean
}

interface GroupOption {
  label: string
  options: Option[]
}

export default defineComponent({
  name: 'DatabaseFilter',
  components: {
    TagFilter,
    FilterHelpText,
    Loading,
    ElOption,
    ElOptionGroup,
    ElSelect,
  },
  props: {
    value: String,
    fixedOptions: Array,
  },
  setup(props, { emit }) {
    const apolloClientKey: InjectionKey<ApolloClient<any>> = DefaultApolloClient as InjectionKey<ApolloClient<any>>
    const apolloClient = inject(apolloClientKey)

    const selectRef = ref(null)
    const groups = ref<GroupOption[]>([])
    const options = ref<Record<string, Option>>({})
    const previousQuery = ref(null)
    const store = useStore()
    const datasetFilter = ref(store.getters.filter.datasetIds)
    const hasDatasetFilter = computed(() => datasetFilter.value?.length > 0)
    const DATABASE_OPTIONS_QUERY = gql`
      query DatabaseOptions {
        allMolecularDBs {
          id
          name
          version
          archived
          group {
            id
            shortName
          }
        }
      }
    `
    const DATABASE_OPTIONS_FROM_DATASETS_QUERY = gql`
      query DatabaseOptionsFromDatasets($filter: DatasetFilter) {
        allDatasets(filter: $filter) {
          id
          databases {
            id
            name
            version
            archived
            group {
              id
              shortName
            }
          }
        }
      }
    `

    let allDBsByGroup = ref()
    let datasetDBsByGroup = ref()

    watch(
      hasDatasetFilter,
      async (newVal) => {
        if (!apolloClient) {
          return
        }
        if (!newVal) {
          const { data } = await apolloClient.query({
            query: DATABASE_OPTIONS_QUERY,
            fetchPolicy: 'cache-first',
          })
          const moldbs = data.allMolecularDBs || []

          allDBsByGroup.value = getDatabasesByGroup(moldbs)
        } else {
          const { data } = await apolloClient.query({
            query: DATABASE_OPTIONS_FROM_DATASETS_QUERY,
            fetchPolicy: 'cache-first',
            variables: () => ({
              filter: { ids: datasetFilter.value.join('|') },
            }),
          })
          const dbs = {}
          for (const { databases } of data.allDatasets) {
            for (const db of databases) {
              dbs[db.id] = db
            }
          }
          datasetDBsByGroup.value = getDatabasesByGroup(Object.values(dbs))
        }
      },
      { immediate: true }
    )

    const label = computed(() => {
      if (props.value === undefined) return '(any)'
      if (options.value[props.value] !== undefined) {
        return options.value[props.value].label
      }
      return '(unknown)'
    })

    const valueIfKnown = computed(() => {
      return props.value && options.value[props.value] ? props.value : undefined
    })

    const dbsByGroup = computed(() => {
      return hasDatasetFilter.value ? datasetDBsByGroup.value : allDBsByGroup.value
    })

    const initialized = computed(() => {
      return dbsByGroup.value !== null && groups.value !== null
    })

    watch(dbsByGroup, () => {
      previousQuery.value = null
      options.value = {}
      filterOptions('')
    })
    // watch(props.fixedOptions, () => {
    //   previousQuery.value = null
    //   options.value = {}
    //   filterOptions('')
    // });

    function mapDBtoOption(db: MolecularDB): Option {
      return {
        value: db.id ? db.id.toString() : '',
        label: formatDatabaseLabel(db),
        archived: db.archived,
      }
    }

    function filterOptions(query: string) {
      if (query === previousQuery.value || dbsByGroup.value === null) {
        return
      }

      const hideArchived = !hasDatasetFilter.value && query.length === 0

      try {
        const groupOptions: GroupOption[] = []
        const sourceDatabases =
          Array.isArray(props.fixedOptions) && props.fixedOptions.length > 0
            ? getDatabasesByGroup(props.fixedOptions)
            : dbsByGroup.value
        const queryRegex = new RegExp(query, 'i')

        for (const group of sourceDatabases) {
          const localOptions: Option[] = []
          for (const db of group.molecularDatabases) {
            const id = db.id.toString()
            if (!(id in options.value)) {
              options.value[id] = mapDBtoOption(db)
            }
            const option = options.value[id]
            if (hideArchived && db.archived && props.value !== option.value) {
              continue
            }
            if (queryRegex.test(option.label)) {
              localOptions.push(option)
            }
          }
          if (localOptions.length) {
            groupOptions.push({
              label: group.shortName,
              options: sortBy(localOptions, 'label'),
            })
          }
        }

        groups.value = groupOptions
        previousQuery.value = query
      } catch (err) {
        groups.value = []
        previousQuery.value = null
        throw err
      }
    }

    function onInput(val: string) {
      emit('input', val)
      emit('change', val)
    }

    function destroy() {
      emit('destroy')
    }

    return {
      allDBsByGroup,
      datasetDBsByGroup,
      label,
      valueIfKnown,
      dbsByGroup,
      initialized,
      datasetFilter,
      hasDatasetFilter,
      filterOptions,
      onInput,
      destroy,
      groups,
      selectRef,
    }
  },
})
</script>

<style>
.el-select-dropdown.is-multiple .el-select-dropdown__wrap {
  max-height: 600px;
}
.el-select-dropdown__item.hover > [data-archived-badge],
.el-select-dropdown__item:hover > [data-archived-badge] {
  @apply bg-gray-200;
}
</style>
