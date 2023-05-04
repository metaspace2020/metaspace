<template>
  <div>
    <filter-panel
      level="dataset"
      :set-dataset-owner-options="setDatasetOwnerOptions"
    />
    <div>
      <el-form
        id="dataset-list-header"
        :inline="true"
      >
        <el-radio-group
          class="p-2 flex flex-row items-center"
          value="List"
          size="small"
          @input="onChangeTab"
        >
          <el-radio-button label="List" />
          <el-radio-button label="Summary" />
        </el-radio-group>

        <el-checkbox-group
          v-model="categories"
          v-loading="countLoading"
          :min="1"
          class="p-2 dataset-status-checkboxes"
        >
          <el-checkbox
            class="cb-annotating"
            label="ANNOTATING"
          >
            Processing {{ count('ANNOTATING') }}
          </el-checkbox>
          <el-checkbox
            class="cb-queued"
            label="QUEUED"
          >
            Queued {{ count('QUEUED') }}
          </el-checkbox>
          <el-checkbox label="FINISHED">
            Finished {{ count('FINISHED') }}
          </el-checkbox>
          <el-checkbox
            v-if="canSeeFailed"
            class="cb-failed"
            label="FAILED"
          >
            Failed {{ count('FAILED') }}
          </el-checkbox>
        </el-checkbox-group>
        <div style="flex-grow: 1;" />

        <div class="flex flex-row items-center justify-between flex-1">
          <sort-dropdown
            class="p-2"
            @sort="handleSortChange"
          />

          <el-button
            v-if="nonEmpty"
            :disabled="isExporting"
            size="small"
            @click="startExport"
          >
            Export to CSV
          </el-button>
        </div>
      </el-form>
    </div>

    <dataset-list
      v-loading="loading"
      :datasets="datasets"
      allow-double-column
    />

    <div class="mb-8 p-2 flex flex-row justify-end">
      <el-pagination
        v-if="totalCount > 0"
        class="flex"
        hide-on-single-page
        :total="totalCount"
        :current-page.sync="currentPage"
        :pager-count="11"
        layout="prev, pager, next"
        :page-size="recordsPerPage"
      />
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import {
  countDatasetsByStatusQuery,
  countDatasetsQuery,
  datasetDeletedQuery,
  datasetDetailItemsQuery,
  datasetStatusUpdatedQuery,
} from '../../../api/dataset'
import { metadataExportQuery } from '../../../api/metadata'
import DatasetList from './DatasetList.vue'
import { FilterPanel } from '../../Filters/index'
import { SortDropdown } from '../../../components/SortDropdown/SortDropdown'
import FileSaver from 'file-saver'
import delay from '../../../lib/delay'
import formatCsvRow, { csvExportHeader } from '../../../lib/formatCsvRow'
import { currentUserRoleWithGroupQuery } from '../../../api/user'
import updateApolloCache, { removeDatasetFromAllDatasetsQuery } from '../../../lib/updateApolloCache'
import { merge, orderBy, pick } from 'lodash-es'
import { formatDatabaseLabel } from '../../MolecularDatabases//formatting'
import { datasetOwnerOptions } from '../../../lib/filterTypes'
import { getLocalStorage } from '../../../lib/localStorage'

const extractGroupedStatusCounts = (data) => {
  const counts = {
    QUEUED: 0,
    ANNOTATING: 0,
    FINISHED: 0,
    FAILED: 0,
  };
  (data.countDatasetsPerGroup.counts || []).forEach(({ fieldValues: [status], count }) => {
    // Upper-case statuses because ElasticSearch only outputs the normalized, lower-case values
    // from the field-specific index
    counts[status.toUpperCase()] = count
  })
  return counts
}

export default Vue.extend({
  name: 'DatasetTable',
  components: {
    DatasetList,
    FilterPanel,
    SortDropdown,
  },
  data() {
    return {
      recordsPerPage: 20,
      csvChunkSize: 1000,
      categories: ['ANNOTATING', 'QUEUED', 'FINISHED'],
      isExporting: false,
      loading: 0,
      countLoading: 0,
      orderBy: 'ORDER_BY_DATE',
      sortingOrder: 'DESCENDING',
    }
  },
  computed: {
    currentPage: {
      get() {
        return this.$store.getters.settings.table.currentPage
      },
      set(page) {
        // ignore the initial "sync"
        if (page === this.currentPage) {
          return
        }
        this.$store.commit('setCurrentPage', page)
      },
    },
    totalCount: {
      get() {
        const counts = this.datasetCounts
        return !counts ? 0 : Object.keys(counts)
          .reduce((sum, key) => sum + (this.categories.includes(key) ? parseInt(counts[key] || 0, 10) : 0), 0)
      },
    },

    noFilters() {
      const df = this.$store.getters.filter
      for (var key in df) {
        if (df[key]) return false
      }
      return true
    },
    setDatasetOwnerOptions() {
      if (!this.currentUser) {
        return null
      }

      if (this.currentUser && Array.isArray(this.currentUser.groups)) {
        const groups = this.currentUser.groups
          .map((userGroup) => { return { isGroup: true, ...userGroup.group } })
        return datasetOwnerOptions.concat(groups)
      }

      return datasetOwnerOptions
    },
    queryVariables() {
      return {
        dFilter: this.$store.getters.gqlDatasetFilter,
        query: this.$store.getters.ftsQuery,
        inpFdrLvls: [10],
        checkLvl: 10,
        limit: this.recordsPerPage,
        offset: (this.currentPage - 1) * this.recordsPerPage, // Math.max(0, (this.$store.getters.settings.datasets.page - 1) * 100),
        orderBy: this.orderBy,
        sortingOrder: this.sortingOrder,
      }
    },
    nonEmpty() {
      return this.datasets.length > 0
    },
    datasets() {
      const statusOrder = ['QUEUED', 'ANNOTATING']
      let datasets = (this.allDatasets || [])
      datasets = datasets.filter(ds => this.categories.includes(ds.status))

      if (this.orderBy === 'ORDER_BY_DATE') {
        datasets = orderBy(datasets, [
          ds => statusOrder.includes(ds.status) ? statusOrder.indexOf(ds.status) : 999,
          'ds_status_update_dt',
        ], ['asc', 'desc'])
      }

      return datasets
    },
    canSeeFailed() {
      return this.currentUser != null && (this.currentUser?.role === 'admin' || this.datasetCounts?.FAILED > 0)
    },
  },
  mounted() {
    if (this.$store.getters.currentUser) {
      // due to some misbehaviour from setting initial value from getLocalstorage with null values
      // on filterSpecs, the filter is being initialized here if user is logged
      const localDsOwner = this.$store.getters.filter.datasetOwner
        ? this.$store.getters.filter.datasetOwner : (getLocalStorage('datasetOwner') || null)
      this.$store.commit('updateFilter', { ...this.$store.getters.filter, datasetOwner: localDsOwner })
    }
  },

  apollo: {
    $subscribe: {
      datasetDeleted: {
        query: datasetDeletedQuery,
        result({ data }) {
          const datasetId = data.datasetDeleted.id
          removeDatasetFromAllDatasetsQuery(this, 'allDatasets', datasetId)
        },
      },
      datasetStatusUpdated: {
        query: datasetStatusUpdatedQuery,
        async result({ data }) {
          const { dataset, action, stage, isNew } = data.datasetStatusUpdated
          if (this.noFilters && dataset != null) {
            if (action === 'ANNOTATE' && stage === 'QUEUED' && isNew) {
              updateApolloCache(this, 'allDatasets', oldVal => {
                return {
                  ...oldVal,
                  allDatasets: oldVal.allDatasets && [dataset, ...oldVal.allDatasets],
                }
              })
            }
            if (this.allDatasets != null) {
              // Make a best effort to update counts.
              const oldDataset = this.allDatasets.find(ds => ds.id === dataset.id)
              const oldStatus = oldDataset && oldDataset.status
              const newStatus = dataset.status
              updateApolloCache(this, 'datasetCounts', oldVal => {
                const oldCounts = extractGroupedStatusCounts(oldVal)
                return {
                  ...oldVal,
                  counts: Object.entries(oldCounts).map(([status, count]) => ({
                    fieldValues: [status],
                    count: count
                       - (status === oldStatus ? 1 : 0)
                       + (status === newStatus ? 1 : 0),
                  })),
                }
              })
            }
          }
        },
      },
    },
    currentUser: {
      loadingKey: 'loading',
      query: currentUserRoleWithGroupQuery,
      fetchPolicy: 'cache-first',
      update(data) {
        this.$store.commit('updateCurrentUser', data.currentUser)
        return data.currentUser
      },
    },
    allDatasets: {
      loadingKey: 'loading',
      fetchPolicy: 'cache-and-network',
      query: datasetDetailItemsQuery,
      throttle: 1000,
      variables() {
        return {
          ...this.queryVariables,
          dFilter: {
            ...this.queryVariables.dFilter,
            status: this.categories.join('|'),
          },
        }
      },
    },
    datasetCounts: {
      loadingKey: 'countLoading',
      fetchPolicy: 'cache-and-network',
      query: countDatasetsByStatusQuery,
      throttle: 1000,
      update(data) {
        return extractGroupedStatusCounts(data)
      },
      variables() {
        return {
          ...this.queryVariables,
        }
      },
    },
  },
  methods: {
    formatSubmitter: (row, col) =>
      row.submitter.name,
    formatDatasetName: (row, col) =>
      row.name.split('//', 2)[1],
    formatResolvingPower: (row, col) =>
      (row.analyzer.resolvingPower / 1000).toFixed(0) * 1000,
    handleSortChange(value, sortingOrder) {
      this.orderBy = !value ? 'ORDER_BY_DATE' : value
      this.sortingOrder = !sortingOrder ? 'DESCENDING' : sortingOrder
    },
    count(status) {
      if (this.datasetCounts != null) {
        return `(${this.datasetCounts[status] || 0})`
      } else {
        return ''
      }
    },

    async startExport() {
      let csv = csvExportHeader()

      csv += formatCsvRow(['datasetId', 'datasetName', 'group', 'submitter',
        'PI', 'organism', 'organismPart', 'condition', 'growthConditions', 'ionisationSource',
        'maldiMatrix', 'analyzer', 'resPower400', 'polarity', 'uploadDateTime',
        'FDR@10%', 'database', 'opticalImage',
      ])

      function person(p) { return p ? p.name : '' }

      function formatRow(row) {
        const { group, principalInvestigator } = row
        return formatCsvRow([
          row.id,
          row.name,
          group ? group.shortName : '',
          person(row.submitter),
          principalInvestigator ? person(principalInvestigator)
            : group ? (group.adminNames || []).join(', ')
              : '',
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
          (row.rawOpticalImageUrl) ? window.location.origin + row.rawOpticalImageUrl : 'No optical image',
        ])
      }

      function writeCsvChunk(rows) {
        for (const row of rows) {
          csv += formatRow(row)
        }
      }

      this.isExporting = true
      const v = merge({}, this.queryVariables, { dFilter: { status: 'FINISHED' } })
      const totalCount = (await this.$apollo.query({
        query: countDatasetsQuery,
        variables: v,
      })).data.countDatasets
      let offset = 0

      while (this.isExporting && offset < totalCount) {
        const variables = { ...v, offset, limit: this.csvChunkSize }
        const resp = await this.$apollo.query({ query: metadataExportQuery, variables })

        offset += this.csvChunkSize
        writeCsvChunk(resp.data.datasets)
        await delay(50)
      }

      if (!this.isExporting) {
        return
      }

      this.isExporting = false

      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, 'metaspace_datasets.csv')
    },

    onChangeTab(tab) {
      this.$store.commit('setDatasetTab', tab)
    },
  },
})
</script>

<style lang="scss">

 #dataset-page {
   display: flex;
   justify-content: center;
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
