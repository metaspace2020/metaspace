<template>
  <div>
    <filter-panel level="dataset" :set-dataset-owner-options="setDatasetOwnerOptions" />
    <div>
      <el-form id="dataset-list-header" :inline="true">
        <el-radio-group class="p-2 flex flex-row items-center" model-value="List" @change="onChangeTab">
          <el-radio-button label="List" />
          <el-radio-button label="Summary" />
        </el-radio-group>

        <el-checkbox-group
          :model-value="state.categories"
          @change="(value) => (state.categories = value)"
          v-loading="state.countLoading"
          :min="1"
          class="p-2 dataset-status-checkboxes"
        >
          <el-checkbox class="cb-annotating" label="ANNOTATING"> Processing {{ count('ANNOTATING') }} </el-checkbox>
          <el-checkbox class="cb-queued" label="QUEUED"> Queued {{ count('QUEUED') }} </el-checkbox>
          <el-checkbox label="FINISHED"> Finished {{ count('FINISHED') }} </el-checkbox>
          <el-checkbox v-show="canSeeFailed" class="cb-failed" label="FAILED">
            Failed {{ count('FAILED') }}
          </el-checkbox>
        </el-checkbox-group>
        <div style="flex-grow: 1" />
        <div class="flex flex-row items-center justify-between flex-1">
          <sort-dropdown class="p-2" size="default" @sort="handleSortChange" />

          <el-button v-show="nonEmpty" :disabled="state.isExporting" @click="startExport"> Export to CSV </el-button>
        </div>
      </el-form>
    </div>

    <dataset-list v-loading="loading" :datasets="datasets" :key="datasets.length" allow-double-column />

    <div class="mb-8 p-2 flex flex-row justify-end">
      <el-pagination
        v-show="totalCount > 0"
        class="flex"
        hide-on-single-page
        :total="totalCount"
        :current-page="currentPage"
        :pager-count="11"
        layout="prev, pager, next"
        :page-size="state.recordsPerPage"
        @current-change="setCurrentPage"
      />
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, reactive, onMounted, watch, inject } from 'vue'
import { useStore } from 'vuex'
import { DefaultApolloClient } from '@vue/apollo-composable'
import {
  countDatasetsByStatusQuery,
  countDatasetsQuery,
  datasetDeletedQuery,
  datasetDetailItemsQuery,
  datasetStatusUpdatedQuery,
} from '../../../api/dataset'
import { datasetOwnerOptions } from '../../../lib/filterTypes'
import { FilterPanel } from '../../../modules/Filters'
import { useQuery } from '@vue/apollo-composable'
import { merge, orderBy } from 'lodash-es'
import { currentUserRoleWithGroupQuery } from '../../../api/user'
import { getLocalStorage } from '../../../lib/localStorage'
import SortDropdown from '../../../components/SortDropdown/SortDropdown'
import formatCsvRow, { csvExportHeader } from '../../../lib/formatCsvRow'
import { formatDatabaseLabel } from '../../MolecularDatabases//formatting'
import delay from '../../../lib/delay'
import * as FileSaver from 'file-saver'
import { metadataExportQuery } from '../../../api/metadata'
import DatasetList from './DatasetList.vue'
import {
  ElLoading,
  ElForm,
  ElRadioGroup,
  ElRadioButton,
  ElCheckboxGroup,
  ElCheckbox,
  ElButton,
  ElPagination,
} from '../../../lib/element-plus'

export default defineComponent({
  name: 'DatasetTable',
  directives: {
    loading: ElLoading.directive,
  },
  components: {
    FilterPanel,
    ElForm,
    ElRadioGroup,
    ElRadioButton,
    ElCheckboxGroup,
    ElCheckbox,
    ElButton,
    SortDropdown,
    ElPagination,
    DatasetList,
  },
  setup() {
    const store = useStore()
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive({
      recordsPerPage: 20,
      csvChunkSize: 1000,
      categories: ['ANNOTATING', 'QUEUED', 'FINISHED'],
      isExporting: false,
      countLoading: 0,
      orderBy: 'ORDER_BY_DATE',
      sortingOrder: 'DESCENDING',
      allDatasets: [],
      datasetsLoading: false,
      datasetCounts: [],
      datasetCountsLoading: false,
    })

    const queryVariables = computed(() => {
      return {
        dFilter: store.getters.gqlDatasetFilter,
        query: store.getters.ftsQuery,
        inpFdrLvls: [10],
        checkLvl: 10,
        limit: state.recordsPerPage,
        offset: ((store.getters.settings?.table?.currentPage || 1) - 1) * state.recordsPerPage,
        orderBy: state.orderBy,
        sortingOrder: state.sortingOrder,
      }
    })

    const { result: currentUserResult, loading: currentUserLoading } = useQuery(currentUserRoleWithGroupQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const loading = computed(() => datasetsLoading.value || datasetCountsLoading.value || currentUserLoading.value)

    const setCurrentPage = (page) => {
      // ignore the initial "sync"
      if (page === currentPage.value) {
        return
      }
      store.commit('setCurrentPage', page)
    }

    const currentPage = computed(() => store.getters.settings?.table?.currentPage)

    const totalCount = computed(() => {
      const counts = state.datasetCounts
      return !counts
        ? 0
        : Object.keys(counts).reduce(
            (sum, key) => sum + (state.categories.includes(key) ? parseInt(counts[key] || 0, 10) : 0),
            0
          )
    })

    const setDatasetOwnerOptions = computed(() => {
      if (!currentUser.value) {
        return null
      }

      if (currentUser.value && Array.isArray(currentUser.value.groups)) {
        const groups = currentUser.value.groups.map((userGroup) => {
          return { isGroup: true, ...userGroup.group }
        })
        return datasetOwnerOptions.concat(groups)
      }

      return datasetOwnerOptions
    })

    const extractGroupedStatusCounts = (data) => {
      const counts = {
        QUEUED: 0,
        ANNOTATING: 0,
        FINISHED: 0,
        FAILED: 0,
      }
      ;(data?.countDatasetsPerGroup.counts || []).forEach(({ fieldValues: [status], count }) => {
        // Upper-case statuses because ElasticSearch only outputs the normalized, lower-case values
        // from the field-specific index
        counts[status.toUpperCase()] = count
      })
      return counts
    }

    watch(currentUserResult, async (newResult) => {
      if (newResult) {
        await store.commit('updateCurrentUser', newResult.currentUser)
        await initializeTable()
      }
    })

    function count(status) {
      return state.datasetCounts ? `(${state.datasetCounts[status] || 0})` : ''
    }

    const nonEmpty = computed(() => {
      return datasets.value.length > 0
    })

    const datasets = computed(() => {
      const statusOrder = ['QUEUED', 'ANNOTATING']
      let datasets = allDatasets.value || []
      datasets = datasets.filter((ds) => state.categories.includes(ds.status))

      if (state.orderBy === 'ORDER_BY_DATE') {
        datasets = orderBy(
          datasets,
          [(ds) => (statusOrder.includes(ds.status) ? statusOrder.indexOf(ds.status) : 999), 'ds_status_update_dt'],
          ['asc', 'desc']
        )
      }

      return datasets
    })

    const canSeeFailed = computed(() => {
      return currentUser.value != null && (currentUser.value?.role === 'admin' || state.datasetCounts?.FAILED > 0)
    })

    const queryOptions = reactive({ enabled: true, fetchPolicy: 'cache-first', throttle: 1000 })
    const {
      result: datasetQueryResult,
      loading: datasetsLoading,
      refetch: refetchDatasets,
      subscribeToMore,
    } = useQuery(
      datasetDetailItemsQuery,
      () => ({
        ...queryVariables.value,
        dFilter: {
          ...queryVariables.value.dFilter,
          status: state.categories.join('|'),
        },
      }),
      queryOptions
    )
    const allDatasets = computed(() => datasetQueryResult.value?.allDatasets)

    const {
      loading: datasetCountsLoading,
      onResult: onCountResult,
      refetch: refetchCounts,
      subscribeToMore: subscribeToMoreCounts,
    } = useQuery(countDatasetsByStatusQuery, () => queryVariables.value, queryOptions)
    onCountResult((result) => {
      state.datasetCounts = extractGroupedStatusCounts(result.data)
    })

    const initializeTable = async () => {
      await refetchDatasets()
      await refetchCounts()
      if (currentUser.value) {
        // due to some misbehaviour from setting initial value from getLocalstorage with null values
        // on filterSpecs, the filter is being initialized here if user is logged
        const localDsOwner = store.getters.filter.datasetOwner
          ? store.getters.filter.datasetOwner
          : getLocalStorage('datasetOwner') || null
        if (localDsOwner) {
          store.commit('updateFilter', { ...store.getters.filter, datasetOwner: localDsOwner })
        }
      }
    }

    onMounted(async () => {
      subscribeToMore({
        document: datasetStatusUpdatedQuery,
        updateQuery: () => {
          initializeTable()
        },
      })
      subscribeToMoreCounts({
        document: datasetDeletedQuery,
        updateQuery: () => {
          initializeTable()
        },
      })
      await initializeTable()
    })

    function handleSortChange(value, sortingOrder) {
      state.orderBy = !value ? 'ORDER_BY_DATE' : value
      state.sortingOrder = !sortingOrder ? 'DESCENDING' : sortingOrder
    }

    async function startExport() {
      let csv = csvExportHeader()

      csv += formatCsvRow([
        'datasetId',
        'datasetName',
        'group',
        'submitter',
        'PI',
        'organism',
        'organismPart',
        'condition',
        'growthConditions',
        'ionisationSource',
        'maldiMatrix',
        'analyzer',
        'resPower400',
        'polarity',
        'uploadDateTime',
        'FDR@10%',
        'database',
        'opticalImage',
      ])

      function person(p) {
        return p ? p.name : ''
      }

      function formatRow(row) {
        const { group, principalInvestigator } = row
        return formatCsvRow([
          row.id,
          row.name,
          group ? group.shortName : '',
          person(row.submitter),
          principalInvestigator ? person(principalInvestigator) : group ? (group.adminNames || []).join(', ') : '',
          row.organism,
          row.organismPart,
          row.condition,
          row.growthConditions,
          row.ionisationSource,
          row.maldiMatrix,
          row.analyzer.type,
          Math.round(row.analyzer.resolvingPower),
          row.polarity.toLowerCase(),
          row.uploadDateTime,
          row.fdrCounts ? row.fdrCounts.counts : '',
          row.fdrCounts ? formatDatabaseLabel({ name: row.fdrCounts.dbName, version: row.fdrCounts.dbVersion }) : '',
          row.rawOpticalImageUrl ? window.location.origin + row.rawOpticalImageUrl : 'No optical image',
        ])
      }

      function writeCsvChunk(rows) {
        for (const row of rows) {
          csv += formatRow(row)
        }
      }

      state.isExporting = true
      const v = merge({}, queryVariables.value, { dFilter: { status: 'FINISHED' } })
      const totalCount = (
        await apolloClient.query({
          query: countDatasetsQuery,
          variables: v,
        })
      ).data.countDatasets
      let offset = 0

      while (state.isExporting && offset < totalCount) {
        const variables = { ...v, offset, limit: state.csvChunkSize }
        const resp = await apolloClient.query({ query: metadataExportQuery, variables, fetchPolicy: 'no-cache' })

        offset += state.csvChunkSize
        writeCsvChunk(resp.data.datasets)
        await delay(50)
      }

      if (!state.isExporting) {
        return
      }

      state.isExporting = false

      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, 'metaspace_datasets.csv')
    }

    function onChangeTab(tab) {
      store.commit('setDatasetTab', tab)
    }

    return {
      orderBy,
      setDatasetOwnerOptions,
      state,
      onChangeTab,
      count,
      handleSortChange,
      nonEmpty,
      startExport,
      canSeeFailed,
      datasets,
      totalCount,
      currentPage,
      loading,
      setCurrentPage,
    }
  },
})
</script>

<style lang="scss">
#dataset-page {
  display: flex;
  justify-content: center;

  .el-loading-mask {
    background-color: rgba(255, 255, 255, 0.3);
  }
}

.dataset-status-checkboxes {
  padding: 5px 20px;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.cb-annotating .el-checkbox__input.is-checked .el-checkbox__inner {
  @apply bg-success border-success;
}

.cb-queued .el-checkbox__input.is-checked .el-checkbox__inner {
  @apply bg-gray-500 border-gray-500;
}

.cb-failed .el-checkbox__input.is-checked .el-checkbox__inner {
  @apply bg-danger border-danger;
}

#dataset-list-header {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
</style>
