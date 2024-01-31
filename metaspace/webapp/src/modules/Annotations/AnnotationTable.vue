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
        property="dataset.group.name"
        label="Lab"
        min-width="95"
        sortable="custom"
      >
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              <span v-if="props.row.dataset.group">{{ props.row.dataset.group.name }}</span>
              <i v-else>No Group</i>
            </span>
            <filter-icon
              v-if="props.row.dataset.group"
              class="cell-filter-button"
              @click="filterGroup(props.row)"
            >
              <title>Limit results to this group</title>
            </filter-icon>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Dataset')"
        key="dataset"
        property="dataset.name"
        label="Dataset"
        min-width="140"
        sortable="custom"
      >
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              {{ formatDatasetName(props.row) }}
            </span>
            <filter-icon
              class="cell-filter-button"
              @click="filterDataset(props.row)"
            >
              <title>Limit results to this dataset</title>
            </filter-icon>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Annotation')"
        key="sumFormula"
        property="sumFormula"
        label="Annotation"
        sortable="custom"
        min-width="120"
      >
        <template slot-scope="props">
          <annotation-table-mol-name :annotation="props.row" />
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Adduct')"
        key="adduct"
        property="adduct"
        label="Adduct"
        sortable="custom"
        min-width="80"
      >
        <template slot-scope="props">
          <span> {{ props.row.adduct }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('mz')"
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
            <filter-icon
              class="cell-filter-button"
              @click="filterMZ(props.row)"
            >
              <title>Limit results to this m/z</title>
            </filter-icon>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('OffSampleProb')"
        key="offSampleProb"
        property="offSampleProb"
        label="Off-sample %"
        sortable="custom"
        min-width="120"
      >
        <template slot-scope="props">
          <span> {{ (props.row.offSampleProb === null || props.row.offSampleProb === undefined) ?
            '-' : (props.row.offSampleProb * 100).toFixed(0) }} % </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('rhoSpatial')"
        key="rhoSpatial"
        property="rhoSpatial"
        sortable="custom"
        min-width="70"
      >
        <span slot="header">
          &rho;<sub>spatial</sub>
        </span>
        <template slot-scope="props">
          <span> {{ props.row.rhoSpatial }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('rhoSpectral')"
        key="rhoSpectral"
        property="rhoSpectral"
        sortable="custom"
        min-width="80"
      >
        <span slot="header">
          &rho;<sub>spectral</sub>
        </span>
        <template slot-scope="props">
          <span> {{ props.row.rhoSpectral }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('rhoChaos')"
        key="rhoChaos"
        property="rhoChaos"
        sortable="custom"
        min-width="70"
      >
        <span slot="header">
          &rho;<sub>chaos</sub>
        </span>
        <template slot-scope="props">
          <span> {{ props.row.rhoChaos }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('MSM')"
        key="msmScore"
        property="msmScore"
        label="MSM"
        sortable="custom"
        min-width="70"
      >
        <template slot-scope="props">
          <span>{{ formatMSM(props.row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Database')"
        key="database"
        property="database"
        label="Database"
        sortable="custom"
        min-width="90"
      >
        <template slot-scope="props">
          <span> {{ props.row.database }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('Molecules')"
        key="possibleCompounds"
        property="possibleCompounds"
        label="Molecules"
        show-overflow-tooltip
        min-width="90"
      >
        <template slot-scope="props">
          <div class="long-text-col">
            {{ props.row.possibleCompounds.map((molecule) => molecule.name).join(', ') }}
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('isomers')"
        key="isomers"
        property="isomers"
        label="Isomers"
        min-width="90"
        sortable="custom"
      >
        <template slot-scope="props">
          {{ props.row.possibleCompounds.length }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('isobars')"
        key="isobars"
        property="isobars"
        label="Isobars"
        min-width="80"
        sortable="custom"
      >
        <template slot-scope="props">
          {{ props.row.isobars.length }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('maxIntensity')"
        key="maxIntensity"
        property="isotopeImages[0].maxIntensity"
        label="Max Intensity"
        min-width="120"
        sortable="custom"
      >
        <template slot-scope="props">
          {{ props.row.isotopeImages[0].maxIntensity.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('totalIntensity')"
        key="totalIntensity"
        property="isotopeImages[0].totalIntensity"
        label="Total Intensity"
        min-width="120"
        sortable="custom"
      >
        <template slot-scope="props">
          {{ props.row.isotopeImages[0].totalIntensity.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('FDR')"
        key="fdrLevel"
        property="fdrLevel"
        label="FDR"
        class-name="fdr-cell"
        sortable="custom"
        min-width="60"
      >
        <template slot-scope="props">
          <span>{{ formatFDR(props.row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="showColocCol"
        key="colocalizationCoeff"
        property="colocalizationCoeff"
        label="Coloc."
        class-name="coloc-cell"
        sortable="custom"
        min-width="70"
      >
        <template slot-scope="props">
          <span v-if="props.row.colocalizationCoeff != null">
            {{ (props.row.colocalizationCoeff).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-between items-start mt-2">
      <div class="mt-1">
        <el-pagination
          v-if="!initialLoading"
          :small="false"
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

      <div class="flex w-full items-center justify-end flex-wrap">
        <el-popover
          v-if="showCustomCols"
          class="mt-1"
        >
          <el-button
            slot="reference"
            class="select-btn-wrapper relative"
            @click="handleColSelectorClick"
          >
            <new-feature-badge
              feature-key="custom-cols"
              class="new-custom-badge"
            >
              Columns
            </new-feature-badge>
            <i class="el-icon-arrow-down select-btn-icon" />
          </el-button>
          <div>
            <div
              v-for="(column, i) in columns"
              :key="column.label"
              class="cursor-pointer select-none"
              @click="handleColumnClick(i)"
            >
              <template v-if="!column.hide">
                <i
                  v-if="column.selected"
                  class="el-icon-check"
                />
                <i
                  v-else
                  class="el-icon-check invisible"
                />
                <span v-if="column.src.includes('rho')"> &rho;<sub>{{ column.label }}</sub> </span>
                <span v-else>{{ column.label }}</span>
              </template>
            </div>
          </div>
        </el-popover>

        <div
          v-if="isExporting"
          class="select-btn-wrapper ml-2 mt-1"
        >
          <progress-button
            class="export-btn"
            :width="146"
            :height="42"
            :percentage="exportProgress * 100"
            @click="abortExport"
          >
            Cancel
          </progress-button>
        </div>

        <el-popover
          v-else
          ref="exportPop"
          class="select-btn-wrapper ml-2 mt-1"
          popper-class="export-pop"
        >
          <div slot="reference">
            <el-button
              class="select-btn-wrapper relative"
              :width="146"
              :height="42"
            >
              Export to CSV
              <i class="el-icon-arrow-down select-btn-icon" />
            </el-button>
          </div>

          <p
            class="export-option"
            @click="startExport"
          >
            Annotations table
          </p>
          <p
            class="export-option"
            @click="startIntensitiesExport"
          >
            Pixel intensities
          </p>
        </el-popover>

        <div
          v-if="showCustomCols"
          class="ml-2 mt-1"
        >
          <el-button
            v-if="isFullScreen"
            class="full-screen-btn"
            @click="$emit('screen')"
          >
            <full-screen
              class="full-screen-icon"
            />
          </el-button>
          <el-button
            v-else
            class="full-screen-btn"
            @click="$emit('screen')"
          >
            <exit-full-screen
              class="full-screen-icon"
            />
          </el-button>
        </div>
      </div>
    </div>
  </el-row>
</template>

<script>
import ProgressButton from './ProgressButton.vue'
import AnnotationTableMolName from './AnnotationTableMolName.vue'
import FilterIcon from '../../assets/inline/filter.svg'
import {
  annotationListQuery,
  tableExportQuery,
} from '../../api/annotation'

import Vue from 'vue'
import FileSaver from 'file-saver'
import formatCsvRow, { csvExportHeader, formatCsvTextArray, csvExportIntensityHeader } from '../../lib/formatCsvRow'
import { invert, uniqBy, isEqual } from 'lodash-es'
import config from '../../lib/config'
import isSnapshot from '../../lib/isSnapshot'
import { readNpy } from '../../lib/npyHandler'
import safeJsonParse from '../../lib/safeJsonParse'
import { getDatasetDiagnosticsQuery, getRoisQuery } from '../../api/dataset'
import FullScreen from '../../assets/inline/full_screen.svg'
import ExitFullScreen from '../../assets/inline/exit_full_screen.svg'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'
import NewFeatureBadge, { hideFeatureBadge } from '../../components/NewFeatureBadge'
import { getIonImage, loadPngFromUrl } from '../../lib/ionImageRendering'

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
  ORDER_BY_ADDUCT: 'adduct',
  ORDER_BY_GROUP: 'dataset.group.name',
  ORDER_BY_DATASET: 'dataset.name',
  ORDER_BY_DATABASE: 'database',
  ORDER_BY_CHAOS: 'rhoChaos',
  ORDER_BY_SPATIAL: 'rhoSpatial',
  ORDER_BY_SPECTRAL: 'rhoSpectral',
  ORDER_BY_MAX_INT: 'isotopeImages[0].maxIntensity',
  ORDER_BY_TOTAL_INT: 'isotopeImages[0].totalIntensity',
  ORDER_BY_ISOMERS: 'isomers',
  ORDER_BY_ISOBARS: 'isobars',
}
const COLUMN_TO_SORT_ORDER = invert(SORT_ORDER_TO_COLUMN)

export default Vue.extend({
  name: 'AnnotationTable',
  components: {
    ProgressButton,
    AnnotationTableMolName,
    FilterIcon,
    ExitFullScreen,
    FullScreen,
    NewFeatureBadge,
  },
  props: ['hideColumns', 'isFullScreen'],
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
      loadedSnapshotAnnotations: false,
      showCustomCols: config.features.custom_cols,
      columns: [
        {
          id: 1,
          label: 'Lab',
          src: 'Group',
          selected: true,
          default: true,
        },
        {
          id: 2,
          label: 'Dataset',
          src: 'Dataset',
          selected: true,
          default: true,
        },
        {
          id: 3,
          label: 'Annotation',
          src: 'Annotation',
          selected: true,
          default: true,
        },
        {
          id: 4,
          label: 'Adduct',
          src: 'Adduct',
          selected: false,
        },
        {
          id: 5,
          label: 'm/z',
          src: 'mz',
          selected: true,
          default: true,
        },
        {
          id: 6,
          label: 'Off-sample probability %',
          src: 'OffSampleProb',
          selected: false,
        },
        {
          id: 7,
          label: 'spatial',
          src: 'rhoSpatial',
          selected: false,
        },
        {
          id: 8,
          label: 'spectral',
          src: 'rhoSpectral',
          selected: false,
        },
        {
          id: 9,
          label: 'chaos',
          src: 'rhoChaos',
          selected: false,
        },
        {
          id: 10,
          label: 'MSM',
          src: 'MSM',
          selected: true,
          default: true,
        },
        {
          id: 11,
          label: 'Database',
          src: 'Database',
          selected: false,
        },
        {
          id: 12,
          label: 'Molecules',
          src: 'Molecules',
          selected: false,
        },
        {
          id: 13,
          label: 'Isomers',
          src: 'isomers',
          selected: false,
        },
        {
          id: 14,
          label: 'Isobars',
          src: 'isobars',
          selected: false,
        },
        {
          id: 15,
          label: 'Max Intensity',
          src: 'maxIntensity',
          selected: false,
        },
        {
          id: 16,
          label: 'Total Intensity',
          src: 'totalIntensity',
          selected: false,
        },
        {
          id: 17,
          label: 'FDR',
          src: 'FDR',
          selected: true,
          default: true,
        },
        {
          id: 18,
          label: 'Co-localization coefficient',
          src: 'colocalizationCoeff',
          selected: false,
          hide: true,
        },
      ],
    }
  },
  computed: {

    isLoading() {
      return this.$store.state.tableIsLoading
    },

    isNormalized() {
      return this.$store.getters.settings?.annotationView?.normalization
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
        offset: Math.max(0, (this.currentPage - 1) * this.recordsPerPage),
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

    showColocCol() {
      return this.$route.query.colo !== undefined
    },
  },
  watch: {
    '$route.query'() {
      // sort table to update selected sort ui when coloc filter applied from annotation view
      if (
        this.orderBy === 'ORDER_BY_COLOCALIZATION'
        && this.$refs.table
        && typeof this.$refs.table.sort === 'function') {
        setTimeout(
          () => this.$refs.table.sort(SORT_ORDER_TO_COLUMN[this.orderBy], this.sortingOrder.toLowerCase()),
          0)
      }
    },
    '$store.getters.filter.datasetIds'() {
      // hide dataset related filters if dataset filter added
      if (Array.isArray(this.$store.getters.filter.datasetIds)
        && this.$store.getters.filter.datasetIds.length === 1
        && this.showCustomCols) {
        this.hideDatasetRelatedColumns()
      } else if (this.showCustomCols) { // show dataset related filters if dataset filter added
        this.showDatasetRelatedColumns()
      }
    },
    '$route.query.cols'() {
      if (this.$route.query.cols) {
        const columns = this.columns
        const persistedCols = this.$route.query.cols.split(',')
        columns.forEach((column, colIdx) => {
          if (persistedCols.includes(column.id.toString())) {
            columns[colIdx].selected = true
          }
        })
        this.columns = columns
      }
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
        Vue.nextTick(async() => {
          if (isSnapshot() && !this.loadedSnapshotAnnotations) {
            this.nextCurrentRowIndex = -1
            if (Array.isArray(this.$store.state.snapshotAnnotationIds)) {
              if (this.$store.state.snapshotAnnotationIds.length > 1) { // adds annotationFilter if multi mol
                this.updateFilter({ annotationIds: this.$store.state.snapshotAnnotationIds })
              } else { // dont display filter if less than one annotation
                setTimeout(() => this.$store.commit('removeFilter', 'annotationIds'), 500)
              }
              this.nextCurrentRowIndex = this.annotations.findIndex((annotation) =>
                this.$store.state.snapshotAnnotationIds.includes(annotation.id))
              this.loadedSnapshotAnnotations = true
            }
          }

          if (this.nextCurrentRowIndex !== null && this.nextCurrentRowIndex !== -1) {
            this.setCurrentRow(this.nextCurrentRowIndex)
            this.nextCurrentRowIndex = null
          } else if (this.nextCurrentRowIndex !== -1) {
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

        // load ROIs from db
        this.loadRois(uniqBy(data.allAnnotations, 'dataset.id').map((annotation) => annotation?.dataset.id))

        this.totalCount = data.countAnnotations
        this.initialLoading = false
      },
      watchLoading(isLoading) {
        this.$store.commit('updateAnnotationTableStatus', isLoading)
      },
    },
  },
  created() {
    if (!this.showCustomCols) { // do not apply custom column settings
      return
    }

    const columns = this.columns

    if (this.$route.query.cols && Array.isArray(this.$route.query.cols.split(','))) { // load cols from url
      const persistedCols = this.$route.query.cols.split(',')
      columns.forEach((column, colIdx) => {
        if (persistedCols.includes(column.id.toString())) {
          columns[colIdx].selected = true
        }
      })
    } else { // load cols from local storage - legacy
      const localColSettings = getLocalStorage('annotationTableCols')
      if (Array.isArray(localColSettings)) {
        localColSettings.forEach((colSetting) => {
          const colIdx = columns.findIndex(col => col.src === colSetting.src)
          if (colIdx !== -1) {
            columns[colIdx].selected = colSetting.selected
          }
        })
      }
    }

    this.columns = columns
    this.hideDatasetRelatedColumns()
  },
  methods: {
    hideDatasetRelatedColumns() {
      if (Array.isArray(this.filter.datasetIds) && this.filter.datasetIds.length > 0) {
        this.columns.find((col) => col.src === 'Group').selected = false
        this.columns.find((col) => col.src === 'Dataset').selected = false
      }
    },
    showDatasetRelatedColumns() {
      this.columns.find((col) => col.src === 'Group').selected = true
      this.columns.find((col) => col.src === 'Dataset').selected = true
    },
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
      if (this.$refs.table && rows && rows.length) {
        this.$refs.table.setCurrentRow(null)
        const nextIndex = rowIndex < 0 ? 0 : Math.min(rowIndex, rows.length - 1)
        this.$refs.table.setCurrentRow(rows[nextIndex])
      }
    },

    loadRois(datasetIds) {
      datasetIds.map(async(datasetId) => {
        try {
          const resp = await this.$apollo.query({
            query: getRoisQuery,
            variables: {
              datasetId,
            },
            fetchPolicy: 'cache-first',
          })
          if (!resp?.data?.dataset?.roiJson) {
            return
          }
          const roi = JSON.parse(resp?.data?.dataset?.roiJson)
          if (roi && Array.isArray(roi.features) && !this.$store.state.roiInfo[datasetId]) {
            this.$store.commit('setRoiInfo', {
              key: datasetId,
              roi: roi.features.map((feature) => {
                return feature?.properties
                  ? { ...feature?.properties, allVisible: this.$store.state.roiInfo?.visible } : {}
              }),
            })
          }
        } catch (e) {
          // pass
        }
      })
    },

    hidden(columnLabel) {
      return (this.columns.findIndex((col) => col.src === columnLabel) === -1 || !this.showCustomCols)
        ? (this.hideColumns.indexOf(columnLabel) >= 0 || !this.columns.find((col) => col.src === columnLabel)?.selected)
        : !this.columns.find((col) => col.src === columnLabel)?.selected
    },

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
    formatFDR: ({ fdrLevel }) => {
      if (fdrLevel == null) {
        // Annotations in targeted DBs don't get FDR values
        return '\u2014' // &mdash;
      } else if (config.features.raw_fdr) {
        if (fdrLevel <= 0.005) {
          return '< 1%' // Never show "0%", as it's misleading
        } else {
          return Math.round(fdrLevel * 100) + '%'
        }
      } else {
        // Snap to nearest FDR threshold
        for (const level of [5, 10, 20, 50]) {
          if (fdrLevel * 100 <= level + 0.1) {
            return `${level}%`
          }
        }
        return '> 50%'
      }
    },

    onSortChange(event) {
      // this.clearCurrentRow()

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
      // do not set initial row if loading from a snapshot (permalink)
      if (isSnapshot() && !this.loadedSnapshotAnnotations) {
        return null
      }

      this.$store.commit('setAnnotation', row)

      if (row !== null) {
        this.currentRowIndex = this.annotations.indexOf(row)
      }

      this.setNormalizationData(row)
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

    async setNormalizationData(currentAnnotation) {
      if (!currentAnnotation) {
        return null
      }

      try {
        const resp = await this.$apollo.query({
          query: getDatasetDiagnosticsQuery,
          variables: {
            id: currentAnnotation.dataset.id,
          },
          fetchPolicy: 'cache-first',
        })
        const dataset = resp.data.dataset
        const tics = dataset.diagnostics.filter((diagnostic) => diagnostic.type === 'TIC')
        const tic = tics[0].images.filter((image) => image.key === 'TIC' && image.format === 'NPY')
        const { data, shape } = await readNpy(tic[0].url)
        const metadata = safeJsonParse(tics[0].data)
        metadata.maxTic = metadata.max_tic
        metadata.minTic = metadata.min_tic
        delete metadata.max_tic
        delete metadata.min_tic

        this.$store.commit('setNormalizationMatrix', {
          data,
          shape,
          metadata: metadata,
          type: 'TIC',
          showFullTIC: false,
          error: false,
        })
      } catch (e) {
        this.$store.commit('setNormalizationMatrix', {
          data: null,
          shape: null,
          metadata: null,
          showFullTIC: null,
          type: 'TIC',
          error: true,
        })
      }
    },

    filterGroup(row) {
      if (row.dataset.group != null) {
        this.updateFilter({ group: row.dataset.group.id })
      }
    },

    filterDataset(row) {
      this.updateFilter({ datasetIds: [row.dataset.id] })
    },

    filterMZ(row) {
      this.updateFilter({ mz: row.mz.toFixed(4) })
    },

    async startIntensitiesExport() {
      if (this.$refs.exportPop && typeof this.$refs.exportPop.doClose === 'function') {
        this.$refs.exportPop.doClose()
      }

      if (!this.$store.state.annotation?.dataset?.id) { // no annotation selected
        return
      }

      async function formatIntensitiesRow(annotation, normalizationData) {
        const { isotopeImages, ionFormula: molFormula, possibleCompounds, adduct, mz, dataset } = annotation
        const isotopeImage = isotopeImages[0]
        const ionImagePng = await loadPngFromUrl(isotopeImage.url)
        const molName = possibleCompounds.map((m) => m.name).join(',')
        const molIds = possibleCompounds.map((m) => m.information[0].databaseId).join(',')
        const finalImage = getIonImage(ionImagePng, isotopeImages[0], undefined,
          undefined, normalizationData)
        const row = [molFormula, adduct, mz, `"${molName}"`, `"${molIds}"`]
        const { width, height, intensityValues } = finalImage
        const cols = ['mol_formula', 'adduct', 'mz', 'moleculeNames', 'moleculeIds']

        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            cols.push(`x${x}_y${y}`)
            const idx = y * width + x
            row.push(intensityValues[idx])
          }
        }

        return { cols, row, dsName: dataset.name }
      }

      const queryVariables = {
        ...this.queryVariables,
        dFilter: {
          ...this.queryVariables.dFilter,
          ids: this.$store.state.annotation?.dataset?.id,
        },
      }
      const chunkSize = this.csvChunkSize
      let offset = 0
      this.isExporting = true
      let totalCount = 1
      let fileCols
      let fileName
      let rows = ''

      while (this.isExporting && offset < totalCount) {
        const resp = await this.$apollo.query({
          query: annotationListQuery,
          variables: { ...queryVariables, limit: chunkSize, offset },
        })
        totalCount = resp.data.countAnnotations
        for (let i = 0; i < resp.data.allAnnotations.length; i++) {
          if (!this.isExporting) {
            return
          }
          offset += 1
          this.exportProgress = offset / totalCount
          const annotation = resp.data.allAnnotations[i]
          try {
            const { cols, row, dsName } = await formatIntensitiesRow(annotation,
              this.isNormalized
                ? this.$store.state.normalization : undefined)
            if (!fileCols) {
              fileCols = formatCsvRow(cols)
              fileName = `${dsName.replace(/\s/g, '_')}_pixel_intensities${this.isNormalized
                ? '_tic_normalized' : ''}.csv`
            }
            rows += formatCsvRow(row)
          } catch (e) {
            // pass when fail to convert png
          }
        }
      }

      if (this.isExporting) {
        this.isExporting = false
        this.exportProgress = 0
        const csv = csvExportIntensityHeader(this.isNormalized) + fileCols + rows
        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, fileName)
      }
    },

    async startExport() {
      if (this.$refs.exportPop && typeof this.$refs.exportPop.doClose === 'function') {
        this.$refs.exportPop.doClose()
      }

      const chunkSize = this.csvChunkSize
      const includeColoc = !this.hidden('colocalizationCoeff')
      const includeOffSample = config.features.off_sample
      const includeIsobars = config.features.isobars
      const includeNeutralLosses = config.features.neutral_losses
      const includeChemMods = config.features.chem_mods
      const colocalizedWith = this.filter.colocalizedWith
      let csv = csvExportHeader()
      const columns = ['group', 'datasetName', 'datasetId', 'formula', 'adduct',
        ...(includeChemMods ? ['chemMod'] : []),
        ...(includeNeutralLosses ? ['neutralLoss'] : []),
        'ion', 'mz', 'msm', 'fdr', 'rhoSpatial', 'rhoSpectral', 'rhoChaos',
        'moleculeNames', 'moleculeIds', 'minIntensity', 'maxIntensity', 'totalIntensity', 'isomers', 'isobars']
      if (includeColoc) {
        columns.push('colocalizationCoeff')
      }
      if (includeOffSample) {
        columns.push('offSample', 'rawOffSampleProb')
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
          dataset, sumFormula, adduct, chemMod, neutralLoss, ion, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos, possibleCompounds,
          isotopeImages, isomers, isobars,
          offSample, offSampleProb, colocalizationCoeff,
        } = row
        const cells = [
          dataset.group ? dataset.group.name : '',
          dataset.name,
          dataset.id,
          sumFormula, 'M' + adduct,
          ...(includeChemMods ? [chemMod] : []),
          ...(includeNeutralLosses ? [neutralLoss] : []),
          ion, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos,
          formatCsvTextArray(possibleCompounds.map(m => m.name)),
          formatCsvTextArray(possibleCompounds.map(databaseId)),
          isotopeImages[0] && isotopeImages[0].minIntensity,
          isotopeImages[0] && isotopeImages[0].maxIntensity,
          isotopeImages[0] && isotopeImages[0].totalIntensity,
          possibleCompounds.length,
          isobars.length,
        ]
        if (includeColoc) {
          cells.push(colocalizedWith === ion ? 'Reference annotation' : colocalizationCoeff)
        }
        if (includeOffSample) {
          cells.push(offSample, offSampleProb)
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

    handleColumnClick(index) {
      this.columns[index].selected = !this.columns[index].selected
      const defaultCols = this.columns.filter((column) => column.default).map((column) => column.id)
      const selectedCols = this.columns.filter((column) => column.selected).map((column) => column.id)
      if (!isEqual(defaultCols, selectedCols)) {
        this.$router.push({ path: this.$route.fullPath, query: { cols: selectedCols.join(',') } })
      } else {
        this.$router.push({ path: this.$route.fullPath, query: { cols: undefined } })
      }

      setLocalStorage('annotationTableCols', this.columns)
    },

    handleColSelectorClick(e) {
      e.stopPropagation()
      hideFeatureBadge('custom-cols')
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
   @apply tracking-wide flex;
 }

 .cell-wrapper .cell-filter-button {
   @apply absolute right-0 self-center fill-current text-blue-500 opacity-0 cursor-pointer;
   width: 16px;
   height: 16px;
   padding: 2px 4px;
 }

 .cell-wrapper:hover .cell-filter-button {
   @apply opacity-100;
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
 .long-text-col{
   text-overflow: ellipsis !important;
   overflow: hidden;
   white-space: nowrap;
 }
 .full-screen-icon{
   transform: scale(0.4);
   margin: -13.5px -11.5px;
 }
 .full-screen-btn{
   padding: 0;
   margin: 0;
   height: 42px;
   width: 42px;
 }
 .el-table table {
   width: 0px; // fix safari dynamic column size bug
 }
 .new-custom-badge{
   .el-badge__content{
     right: 10px !important;
     top: -10px !important;
   }
 }
 .select-btn-wrapper{
   width: 146px;
   height: 42px;
 }

 .export-pop{
   @apply p-0;
 }
 .export-option{
   @apply cursor-pointer p-4 m-0 select-none;

   &:hover{
     @apply bg-blue-100;
   }
 }
 .select-btn-icon{
   position: absolute;
   right: 8px;
 }
</style>
