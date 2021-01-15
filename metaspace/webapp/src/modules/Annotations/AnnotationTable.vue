<template>
  <el-row>
    <el-table
      id="annot-table"
      ref="table"
      v-loading="isLoading"
      :data="annotations"
      size="mini"
      border
      element-loading-text="Loading results …"
      highlight-current-row
      width="100%"
      stripe
      tabindex="1"
      :default-sort="tableSort"
      :row-class-name="getRowClass"
      @keyup.native="onKeyUp"
      @keydown.native="onKeyDown"
      @current-change="onCurrentRowChange"
      @sort-change="onSortChange"
    >
      <p
        v-if="multipleDatasetsColocError"
        slot="empty"
      >
        Colocalization filters cannot be used with multiple datasets selected.
      </p>

      <p
        v-else-if="noColocJobError"
        slot="empty"
      >
        Colocalization data not found. <br>
        This can be caused by having no annotations match the current filters,
        or not having enough annotations at this FDR level for analysis.
      </p>

      <p
        v-else-if="singleDatasetSelected && filter.fdrLevel <= 0.2 && ((filter.minMSM || 0) <= 0.2)"
        slot="empty"
        style="text-align: left;"
      >
        No annotations were found for this dataset at {{ filter.fdrLevel * 100 }}% FDR. This might be because of:
        <ul>
          <li>Incorrect database setting</li>
          <li>Calibration issues</li>
          <li>Wrong polarity provided during upload</li>
        </ul>

        Please:
        <ul>
          <li>Select another database <br>(HMDB-v4 is always applicable)</li>
          <li>Relax the FDR filter</li>
          <li>Look for missing pixels/stripes: <br>these indicate calibration issues</li>
        </ul>
      </p>

      <p
        v-else
        slot="empty"
      >
        No annotations were found
      </p>

      <el-table-column
        v-if="!hidden('Group')"
        key="lab"
        label="Lab"
        min-width="95"
      >
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              <span v-if="props.row.dataset.group">{{ props.row.dataset.group.name }}</span>
              <i v-else>No Group</i>
            </span>
            <img
              v-if="props.row.dataset.group"
              src="../../assets/filter-icon.png"
              title="Limit results to this group"
              @click="filterGroup(props.row)"
            >
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Dataset')"
        key="dataset"
        property="dataset.name"
        label="Dataset"
        min-width="140"
      >
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              {{ formatDatasetName(props.row) }}
            </span>
            <img
              src="../../assets/filter-icon.png"
              title="Limit results to this dataset"
              @click="filterDataset(props.row)"
            >
          </div>
        </template>
      </el-table-column>

      <el-table-column
        key="sumFormula"
        property="sumFormula"
        label="Annotation"
        sortable="custom"
        min-width="120"
      >
        <template slot-scope="props">
          <candidate-molecules-popover
            placement="right"
            :possible-compounds="props.row.possibleCompounds"
            :limit="10"
            :isomers="props.row.isomers"
            :isobars="props.row.isobars"
          >
            <div class="cell-wrapper">
              <span
                class="sf cell-span"
                v-html="renderMolFormulaHtml(props.row.ion)"
              />
              <span
                v-if="props.row.id in channelSwatches"
                class="flex"
              >
                <i
                  class="block mt-1 w-3 h-3 mx-1 box-content border border-solid border-gray-400 rounded-full"
                  :style="{ background: channelSwatches[props.row.id] }"
                />
              </span>
              <img
                v-if="!filter.compoundName"
                src="../../assets/filter-icon.png"
                title="Limit results to this molecular formula"
                @click="filterMolFormula(props.row)"
              >
            </div>
          </candidate-molecules-popover>
        </template>
      </el-table-column>

      <el-table-column
        key="mz"
        property="mz"
        label="m/z"
        sortable="custom"
        min-width="65"
      >
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              {{ formatMZ(props.row) }}
            </span>
            <img
              src="../../assets/filter-icon.png"
              title="Limit results to this m/z (with 5 ppm tolerance)"
              @click="filterMZ(props.row)"
            >
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('OffSampleProb')"
        key="offSampleProb"
        property="offSampleProb"
        label="Off-sample %"
        sortable="custom"
        min-width="60"
      >
        <template slot-scope="props">
          <span> {{ (props.row.offSampleProb * 100).toFixed(0) }}% </span>
        </template>
      </el-table-column>

      <el-table-column
        key="msmScore"
        property="msmScore"
        label="MSM"
        sortable="custom"
        min-width="60"
      >
        <template slot-scope="props">
          <span>{{ formatMSM(props.row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        key="fdrLevel"
        property="fdrLevel"
        label="FDR"
        class-name="fdr-cell"
        sortable="custom"
        min-width="40"
      >
        <template slot-scope="props">
          <span v-if="props.row.fdrLevel == null">&mdash;</span>
          <span v-else>{{ Math.round(props.row.fdrLevel * 100) }}%</span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('ColocalizationCoeff')"
        key="colocalizationCoeff"
        property="colocalizationCoeff"
        label="Coloc."
        class-name="coloc-cell"
        sortable="custom"
        min-width="40"
      >
        <template slot-scope="props">
          <span v-if="props.row.colocalizationCoeff != null">
            {{ (props.row.colocalizationCoeff).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-between items-start mt-2">
      <div>
        <el-pagination
          v-if="!initialLoading"
          :total="totalCount"
          :page-size="recordsPerPage"
          :page-sizes="pageSizes"
          :current-page.sync="currentPage"
          :layout="paginationLayout"
          @size-change="onPageSizeChange"
        />

        <div
          id="annot-count"
          class="mt-2"
        >
          <b>{{ totalCount }}</b> matching {{ totalCount == 1 ? 'record': 'records' }}
        </div>

        <div class="mt-2">
          <div class="fdr-legend-header">
            FDR levels:
          </div>
          <div class="fdr-legend fdr-5">
            5%
          </div>
          <div class="fdr-legend fdr-10">
            10%
          </div>
          <div class="fdr-legend fdr-20">
            20%
          </div>
          <div class="fdr-legend fdr-50">
            50%
          </div>
        </div>
      </div>

      <div>
        <progress-button
          v-if="isExporting && totalCount > 5000"
          class="export-btn"
          :width="130"
          :height="40"
          :percentage="exportProgress * 100"
          @click="abortExport"
        >
          Cancel
        </progress-button>
        <el-button
          v-else
          class="export-btn"
          :disabled="isExporting"
          @click="startExport"
        >
          Export to CSV
        </el-button>
      </div>
    </div>
  </el-row>
</template>

<script>
import { renderMolFormulaHtml } from '../../lib/util'
import ProgressButton from './ProgressButton.vue'
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import {
  annotationListQuery,
  tableExportQuery,
} from '../../api/annotation'

import Vue from 'vue'
import FileSaver from 'file-saver'
import formatCsvRow, { csvExportHeader, formatCsvTextArray } from '../../lib/formatCsvRow'
import { invert } from 'lodash-es'
import config from '../../lib/config'
import { useChannelSwatches } from '../ImageViewer/ionImageState'

const channelSwatches = useChannelSwatches()

// 38 = up, 40 = down, 74 = j, 75 = k
const KEY_TO_ACTION = {
  ArrowUp: 'up',
  K: 'up',
  k: 'up',
  ArrowDown: 'down',
  J: 'down',
  j: 'down',
  ArrowLeft: 'left',
  H: 'left',
  h: 'left',
  ArrowRight: 'right',
  L: 'right',
  l: 'right',
}

const SORT_ORDER_TO_COLUMN = {
  ORDER_BY_MZ: 'mz',
  ORDER_BY_MSM: 'msmScore',
  ORDER_BY_FDR_MSM: 'fdrLevel',
  ORDER_BY_FORMULA: 'sumFormula',
  ORDER_BY_OFF_SAMPLE: 'offSampleProb',
  ORDER_BY_COLOCALIZATION: 'colocalizationCoeff',
}
const COLUMN_TO_SORT_ORDER = invert(SORT_ORDER_TO_COLUMN)

export default Vue.extend({
  name: 'AnnotationTable',
  components: {
    ProgressButton,
    CandidateMoleculesPopover,
  },
  props: ['hideColumns'],
  data() {
    return {
      annotations: [],
      recordsPerPage: 15,
      greenCount: 0,
      pageSizes: [15, 20, 25, 30],
      isExporting: false,
      exportProgress: 0,
      totalCount: 0,
      initialLoading: true,
      csvChunkSize: 1000,
      nextCurrentRowIndex: null,
    }
  },
  computed: {
    channelSwatches() {
      return channelSwatches.value
    },

    isLoading() {
      return this.$store.state.tableIsLoading
    },

    filter() {
      return this.$store.getters.filter
    },

    singleDatasetSelected() {
      let isSimple = true
      for (var key in this.filter) {
        if (!this.filter[key]) {
          continue
        }
        if (['fdrLevel', 'minMSM', 'database', 'datasetIds', 'metadataType'].indexOf(key) === -1) {
          isSimple = false
          break
        }
      }
      return isSimple && this.filter.datasetIds && this.filter.datasetIds.length === 1
    },

    orderBy() {
      return this.$store.getters.settings.table.order.by
    },

    sortingOrder() {
      return this.$store.getters.settings.table.order.dir
    },

    queryVariables() {
      const filter = this.$store.getters.gqlAnnotationFilter
      const dFilter = this.$store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = this.$store.getters.gqlColocalizationFilter
      const query = this.$store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        orderBy: this.orderBy,
        sortingOrder: this.sortingOrder,
        offset: (this.currentPage - 1) * this.recordsPerPage,
        limit: this.recordsPerPage,
        countIsomerCompounds: config.features.isomers,
      }
    },

    tableSort() {
      return {
        prop: SORT_ORDER_TO_COLUMN[this.orderBy] || 'msmScore',
        order: this.sortingOrder.toLowerCase(),
      }
    },

    numberOfPages() {
      return Math.ceil(this.totalCount / this.recordsPerPage)
    },

    currentPage: {
      get() {
        return this.$store.getters.settings.table.currentPage
      },
      set(page) {
        // ignore the initial "sync"
        if (page === this.currentPage) {
          return
        }
        if (this.nextCurrentRowIndex === null) {
          this.nextCurrentRowIndex = 0
        }
        this.$store.commit('setCurrentPage', page)
      },
    },

    currentRowIndex: {
      get() {
        return this.$store.getters.settings.table.row - 1
      },
      set(index) {
        this.$store.commit('setRow', index + 1)
      },
    },

    paginationLayout() {
      const { datasetIds } = this.filter
      const limitedSpace = datasetIds && datasetIds.length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    },
    noColocJobError() {
      return (this.queryVariables.filter.colocalizedWith || this.queryVariables.filter.colocalizationSamples)
        && this.annotations.length === 0
    },
    multipleDatasetsColocError() {
      return (this.queryVariables.filter.colocalizedWith || this.queryVariables.filter.colocalizationSamples)
         && this.$store.getters.filter.datasetIds != null
         && this.$store.getters.filter.datasetIds.length > 1
    },
  },
  mounted() {
    var nCells = (window.innerHeight - 150) / 43
    var pageSizes = this.pageSizes.filter(n => nCells >= n).slice(-1)
    if (pageSizes.length > 0) {
      this.recordsPerPage = pageSizes[0]
    }
  },
  apollo: {
    annotations: {
      query: annotationListQuery,
      fetchPolicy: 'cache-first',
      variables() {
        return this.queryVariables
      },
      update: data => data.allAnnotations,
      throttle: 200,
      result({ data }) {
        // timing hack to allow table state to update
        Vue.nextTick(() => {
          if (this.nextCurrentRowIndex !== null) {
            this.setCurrentRow(this.nextCurrentRowIndex)
            this.nextCurrentRowIndex = null
          } else {
            const curRow = this.getCurrentRow()
            if (!curRow) {
              this.setCurrentRow(this.currentRowIndex)
            }
          }
          // Move focus to the table so that keyboard navigation works, except when focus is on an input element
          const shouldMoveFocus = document.activeElement?.closest('input,select,textarea') == null
          if (this.$refs.table && shouldMoveFocus) {
            this.$refs.table.$el.focus()
          }
        })

        this.totalCount = data.countAnnotations
        this.initialLoading = false
      },
      watchLoading(isLoading) {
        this.$store.commit('updateAnnotationTableStatus', isLoading)
      },
    },
  },
  methods: {
    onPageSizeChange(newSize) {
      this.recordsPerPage = newSize
    },

    getCurrentRow() {
      if (this.$refs.table) {
        const tblStore = this.$refs.table.store
        return tblStore.states.currentRow
      }
      return null
    },

    setCurrentRow(rowIndex, rows = this.annotations) {
      if (this.$refs.table && rows.length) {
        this.$refs.table.setCurrentRow(null)
        const nextIndex = rowIndex < 0 ? 0 : Math.min(rowIndex, rows.length - 1)
        this.$refs.table.setCurrentRow(rows[nextIndex])
      }
    },

    hidden(columnLabel) {
      return this.hideColumns.indexOf(columnLabel) >= 0
    },

    renderMolFormulaHtml,
    getRowClass({ row }) {
      const { fdrLevel, colocalizationCoeff } = row
      const fdrClass =
          fdrLevel == null ? 'fdr-null'
            : fdrLevel <= 0.051 ? 'fdr-5'
              : fdrLevel <= 0.101 ? 'fdr-10'
                : fdrLevel <= 0.201 ? 'fdr-20'
                  : 'fdr-50'
      const colocClass =
         colocalizationCoeff == null ? ''
           : colocalizationCoeff >= 0.949 ? 'coloc-95'
             : colocalizationCoeff >= 0.899 ? 'coloc-90'
               : colocalizationCoeff >= 0.799 ? 'coloc-80'
                 : 'coloc-50'

      return `${fdrClass} ${colocClass}`
    },
    formatMSM: (row, col) => row.msmScore.toFixed(3),
    formatMZ: (row, col) => row.mz.toFixed(4),
    formatDatasetName: (row, col) => row.dataset.name,

    onSortChange(event) {
      this.clearCurrentRow()

      if (!event.order) {
        const { prop, order } = this.tableSort
        // Skip the "unsorted" state by just inverting the last seen sort order
        this.$refs.table.sort(prop, order === 'ascending' ? 'descending' : 'ascending')
        return
      }

      this.$store.commit('setSortOrder', {
        by: COLUMN_TO_SORT_ORDER[event.prop] || this.orderBy,
        dir: event.order.toUpperCase(),
      })
    },

    onCurrentRowChange(row) {
      this.$store.commit('setAnnotation', row)

      if (row !== null) {
        this.currentRowIndex = this.annotations.indexOf(row)
      }
    },

    onKeyDown(event) {
      const action = KEY_TO_ACTION[event.key]
      if (action) {
        event.preventDefault()
        return false
      }
      return true
    },

    onKeyUp(event) {
      const action = KEY_TO_ACTION[event.key]
      if (!action) {
        return
      }

      // WARNING the code below relies on internals of el-table:
      // store.{states.currentRow, mutations.{setData, setCurrentRow}}
      const tblStore = this.$refs.table.store
      const curRow = this.getCurrentRow()
      const curIdx = this.annotations.indexOf(curRow)

      if (action === 'up' && curIdx === 0) {
        if (this.currentPage === 1) {
          return
        }
        this.nextCurrentRowIndex = this.recordsPerPage - 1
        this.currentPage -= 1
        return
      }

      if (action === 'down' && curIdx === this.annotations.length - 1) {
        if (this.currentPage === this.numberOfPages) {
          return
        }
        this.nextCurrentRowIndex = 0
        this.currentPage += 1
        return
      }

      if (action === 'left') {
        this.nextCurrentRowIndex = curIdx
        this.currentPage = Math.max(1, this.currentPage - 1)
        return
      }

      if (action === 'right') {
        this.nextCurrentRowIndex = curIdx
        this.currentPage = Math.min(this.numberOfPages, this.currentPage + 1)
        return
      }

      const delta = action === 'up' ? -1 : +1
      this.setCurrentRow(curIdx + delta)
    },

    clearCurrentRow() {
      var currentRow = document.querySelector('.current-row')
      if (currentRow) {
        currentRow.classList.remove('current-row')
      }
      // filed a bug: https://github.com/ElemeFE/element/issues/1890
      // TODO check if it's really fixed
    },

    updateFilter(delta) {
      const filter = Object.assign({}, this.filter, delta)
      this.$store.commit('updateFilter', filter)
    },

    filterGroup(row) {
      if (row.dataset.group != null) {
        this.updateFilter({ group: row.dataset.group.id })
      }
    },

    filterDataset(row) {
      this.updateFilter({ datasetIds: [row.dataset.id] })
    },

    filterMolFormula(row) {
      this.updateFilter({ compoundName: row.sumFormula })
    },

    filterMZ(row) {
      this.updateFilter({ mz: row.mz.toFixed(4) })
    },

    async startExport() {
      const chunkSize = this.csvChunkSize
      const includeColoc = !this.hidden('ColocalizationCoeff')
      const includeOffSample = config.features.off_sample
      const includeIsomers = config.features.isomers
      const includeIsobars = config.features.isobars
      const colocalizedWith = this.filter.colocalizedWith
      let csv = csvExportHeader()
      const columns = ['group', 'datasetName', 'datasetId', 'formula', 'adduct', 'mz',
        'msm', 'fdr', 'rhoSpatial', 'rhoSpectral', 'rhoChaos',
        'moleculeNames', 'moleculeIds', 'minIntensity', 'maxIntensity', 'totalIntensity']
      if (includeColoc) {
        columns.push('colocalizationCoeff')
      }
      if (includeOffSample) {
        columns.push('offSample', 'rawOffSampleProb')
      }
      if (includeIsomers) {
        columns.push('isomerIons')
      }
      if (includeIsobars) {
        columns.push('isobarIons')
      }
      csv += formatCsvRow(columns)

      function databaseId(compound) {
        return compound.information[0].databaseId
      }

      function formatRow(row) {
        const {
          dataset, sumFormula, adduct, ion, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos, possibleCompounds,
          isotopeImages, isomers, isobars,
          offSample, offSampleProb, colocalizationCoeff,
        } = row
        const cells = [
          dataset.groupApproved && dataset.group ? dataset.group.name : '',
          dataset.name,
          dataset.id,
          sumFormula, 'M' + adduct, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos,
          formatCsvTextArray(possibleCompounds.map(m => m.name)),
          formatCsvTextArray(possibleCompounds.map(databaseId)),
          isotopeImages[0] && isotopeImages[0].minIntensity,
          isotopeImages[0] && isotopeImages[0].maxIntensity,
          isotopeImages[0] && isotopeImages[0].totalIntensity,
        ]
        if (includeColoc) {
          cells.push(colocalizedWith === ion ? 'Reference annotation' : colocalizationCoeff)
        }
        if (includeOffSample) {
          cells.push(offSample, offSampleProb)
        }
        if (includeIsomers) {
          cells.push(formatCsvTextArray(isomers.map(isomer => isomer.ion)))
        }
        if (includeIsobars) {
          cells.push(formatCsvTextArray(isobars.map(isobar => isobar.ion)))
        }

        return formatCsvRow(cells)
      }

      const queryVariables = { ...this.queryVariables }
      let offset = 0
      this.isExporting = true

      while (this.isExporting && offset < this.totalCount) {
        const resp = await this.$apollo.query({
          query: tableExportQuery,
          variables: { ...queryVariables, limit: chunkSize, offset },
        })
        this.exportProgress = offset / this.totalCount
        offset += chunkSize
        csv += resp.data.annotations.map(formatRow).join('')
      }

      if (this.isExporting) {
        this.isExporting = false
        this.exportProgress = 0

        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, 'metaspace_annotations.csv')
      }
    },

    abortExport() {
      this.isExporting = false
      this.exportProgress = 0
    },
  },
})
</script>

<style lang="scss">

 #annot-table:focus {
   outline: 1px solid theme('colors.primary');
   outline-offset: 1px;
 }

 /* fix cell height and align text in the center */
 #annot-table .cell {
   height: 24px;
   display: flex;
   align-items: center;
   padding: 0 0 0 10px;
 }

 #annot-table th > .cell{
   height: 30px;
   font-size: 14px;
 }

 /* don't show long group/dataset names */
 #annot-table .cell {
   white-space: nowrap;
 }

 #annot-table::after {
   background-color: transparent;
 }

  .el-table__body tr.fdr-null > td.fdr-cell, .fdr-legend.fdr-null {
    @apply bg-blue-100;
  }

 .el-table__body tr.fdr-5 > td.fdr-cell, .fdr-legend.fdr-5, .el-table__body tr.coloc-95 > td.coloc-cell {
   background-color: #c8ffc8;
 }

.el-table__body tr.fdr-10 > td.fdr-cell, .fdr-legend.fdr-10, .el-table__body tr.coloc-90 > td.coloc-cell {
   background-color: #e0ffe0;
 }

.el-table__body tr.fdr-20 > td.fdr-cell, .fdr-legend.fdr-20, .el-table__body tr.coloc-80 > td.coloc-cell {
   background-color: #ffe;
 }

 .el-table__body tr.fdr-50 > td.fdr-cell, .fdr-legend.fdr-50, .el-table__body tr.coloc-50 > td.coloc-cell {
   background-color: #fff5e0;
 }

 .el-table__body tr.fdr-null.current-row > td {
   background-color: theme('backgroundColor.blue.200') !important;
 }

 .el-table__body tr.fdr-5.current-row > td {
   background-color: #8f8 !important;
 }

 .el-table__body tr.fdr-10.current-row > td {
   background-color: #bfb !important;
 }

 .el-table__body tr.fdr-20.current-row > td {
   background-color: #ffa !important;
 }

 .el-table__body tr.fdr-50.current-row > td {
   background-color: #ffe5a0 !important;
 }

 .cell-wrapper {
   width: 100%;
   display: flex;
   justify-content: space-between;
 }

 .cell-span {
   @apply tracking-wide;
   width: 80%;
 }

 .cell-wrapper img {
   /*
      don't use display:none because of a TestCafe bug:
      https://github.com/DevExpress/testcafe/issues/1426
   */
   opacity: 0;
   max-height: 20px;
   max-width: 20%;
 }

 .cell-wrapper:hover img {
   display: inherit;
   cursor: pointer;
   opacity: 1;
 }

 .fdr-legend, .fdr-legend-header {
   padding: 5px;
   margin: 0px 0px 10px 0px;
   display: inline-block;
   float: left;
   text-align: center;
 }

 .fdr-legend.fdr-5 {
   border-radius: 5px 0px 0px 5px;
 }

 .fdr-legend.fdr-50 {
   border-radius: 0px 5px 5px 0px;
 }

 #annot-table th.fdr-cell > .cell {
   padding: 0;
 }

 .fdr-cell > .cell, .coloc-cell > .cell {
   justify-content: center;
   padding: 0 10px !important;
 }

 #annot-table .el-table__empty-block {
   min-height: 300px;
 }
 #annot-table .el-table__empty-text {
   line-height: normal;
 }

 #annot-table > .el-loading-mask {
   background-color: white;
 }

 #annot-count {
   padding-left: 5px;
 }
</style>
