<template>
  <el-row>
    <el-table
      id="annot-table"
      ref="table"
      v-loading="isLoading"
      :data="state?.annotations"
      size="small"
      border
      element-loading-text="Loading results …"
      highlight-current-row
      width="100%"
      stripe
      tabindex="1"
      :default-sort="tableSort"
      :row-class-name="getRowClass"
      @keyup="onKeyUp"
      @keydown="onKeyDown"
      @current-change="onCurrentRowChange"
      @sort-change="onSortChange"
    >
      <template v-slot:empty>
        <p v-if="multipleDatasetsColocError">
          Colocalization filters cannot be used with multiple datasets selected.
        </p>

        <p v-else-if="noColocJobError">
          Colocalization data not found. <br>
          This can be caused by having no annotations match the current filters,
          or not having enough annotations at this FDR level for analysis.
        </p>

        <p
          v-else-if="singleDatasetSelected && filter.fdrLevel <= 0.2 && ((filter.minMSM || 0) <= 0.2)"
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
        >
          No annotations were found
        </p>
      </template>


      <el-table-column
        v-if="!hidden('Group')"
        key="lab"
        prop="dataset.group.name"
        label="Lab"
        min-width="95"
        sortable="custom"
      >
        <template v-slot="scope">
          <div class="cell-wrapper">
        <span class="cell-span">
          <span v-if="scope.row.dataset.group">{{ scope.row.dataset.group.name }}</span>
          <i v-else>No Group</i>
        </span>
            <filter-icon
              v-if="scope.row.dataset.group"
              class="cell-filter-button"
              @click="filterGroup(scope.row)"
            >
              <title>Limit results to this group</title>
            </filter-icon>
          </div>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('Dataset')"
        key="dataset"
        prop="dataset.name"
        label="Dataset"
        min-width="140"
        sortable="custom"
      >
        <template v-slot="{ row }">
          <div class="cell-wrapper">
        <span class="cell-span">
          {{ formatDatasetName(row) }}
        </span>
            <filter-icon
              class="cell-filter-button"
              @click="filterDataset(row)"
            >
              <title>Limit results to this dataset</title>
            </filter-icon>
          </div>
        </template>
      </el-table-column>

        <el-table-column
          v-if="!hidden('Annotation')"
          key="sumFormula"
          prop="sumFormula"
          label="Annotation"
          sortable="custom"
          :min-width="120"
        >

          <template v-slot="{ row }">
            <annotation-table-mol-name :annotation="row" />
          </template>
        </el-table-column>

      <el-table-column
        v-if="!hidden('Adduct')"
        key="adduct"
        prop="adduct"
        label="Adduct"
        sortable="custom"
        :min-width="80"
      >
        <template v-slot="{ row }">
          <span> {{ row.adduct }} </span>
        </template>
      </el-table-column>

        <el-table-column
          v-if="!hidden('mz')"
          key="mz"
          prop="mz"
          label="m/z"
          sortable="custom"
          :min-width="65"
        >
          <template v-slot="{ row }">
            <div class="cell-wrapper">
        <span class="cell-span">
          {{ formatMZ(row) }}
        </span>
              <filter-icon
                class="cell-filter-button"
                @click="filterMZ(row)"
              >
                <title>Limit results to this m/z</title>
              </filter-icon>
            </div>
          </template>
        </el-table-column>


      <el-table-column
        v-if="!hidden('OffSampleProb')"
        key="offSampleProb"
        prop="offSampleProb"
        label="Off-sample %"
        sortable="custom"
        :min-width="120"
      >
        <template v-slot="{ row }">
      <span>
        {{
          (row.offSampleProb === null || row.offSampleProb === undefined)
            ? '-'
            : (row.offSampleProb * 100).toFixed(0)
        }} %
      </span>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('rhoSpatial')"
        key="rhoSpatial"
        prop="rhoSpatial"
        sortable="custom"
        :min-width="70"
      >
        <template v-slot:header>
      <span>
        &rho;<sub>spatial</sub>
      </span>
        </template>
        <template v-slot="{ row }">
          <span> {{ row.rhoSpatial }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('rhoSpectral')"
        key="rhoSpectral"
        prop="rhoSpectral"
        sortable="custom"
        :min-width="80"
      >
        <template v-slot:header>
      <span>
        &rho;<sub>spectral</sub>
      </span>
        </template>
        <template v-slot="{ row }">
          <span> {{ row.rhoSpectral }} </span>
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('rhoChaos')"
        key="rhoChaos"
        prop="rhoChaos"
        sortable="custom"
        :min-width="70"
      >
        <template v-slot:header>
      <span>
        &rho;<sub>chaos</sub>
      </span>
        </template>
        <template v-slot="{ row }">
          <span> {{ row.rhoChaos }} </span>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('MSM')"
        key="msmScore"
        prop="msmScore"
        label="MSM"
        sortable="custom"
        :min-width="70"
      >
        <template v-slot="{ row }">
          <span>{{ formatMSM(row) }}</span>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('Database')"
        key="database"
        prop="database"
        label="Database"
        sortable="custom"
        :min-width="90"
      >
        <template v-slot="{ row }">
          <span>{{ row.database }}</span>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('Molecules')"
        key="possibleCompounds"
        prop="possibleCompounds"
        label="Molecules"
        show-overflow-tooltip
        :min-width="90"
      >
        <template v-slot="{ row }">
          <div class="long-text-col">
            {{ row.possibleCompounds.map((molecule) => molecule.name).join(', ') }}
          </div>
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('isomers')"
        key="isomers"
        prop="isomers"
        label="Isomers"
        :min-width="90"
        sortable="custom"
      >
        <template v-slot="{ row }">
          {{ row.possibleCompounds.length }}
        </template>
      </el-table-column>



      <el-table-column
        v-if="!hidden('isobars')"
        key="isobars"
        prop="isobars"
        label="Isobars"
        :min-width="80"
        sortable="custom"
      >
        <template v-slot="{ row }">
          {{ row.isobars.length }}
        </template>
      </el-table-column>


      <el-table-column
        v-if="!hidden('maxIntensity')"
        key="maxIntensity"
        prop="isotopeImages[0].maxIntensity"
        label="Max Intensity"
        :min-width="120"
        sortable="custom"
      >
        <template v-slot="{ row }">
          {{ row.isotopeImages[0].maxIntensity.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('totalIntensity')"
        key="totalIntensity"
        prop="isotopeImages[0].totalIntensity"
        label="Total Intensity"
        :min-width="120"
        sortable="custom"
      >
        <template v-slot="{ row }">
          {{ row.isotopeImages[0].totalIntensity.toFixed(1) }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="!hidden('FDR')"
        key="fdrLevel"
        prop="fdrLevel"
        label="FDR"
        class-name="fdr-cell"
        sortable="custom"
        :min-width="60"
      >
        <template v-slot="{ row }">
          <span>{{ formatFDR(row) }}</span>
        </template>
      </el-table-column>


      <el-table-column
        v-if="showColocCol"
        key="colocalizationCoeff"
        prop="colocalizationCoeff"
        label="Coloc."
        class-name="coloc-cell"
        sortable="custom"
        :min-width="70"
      >
        <template v-slot="{ row }">
      <span v-if="row.colocalizationCoeff != null">
        {{ row.colocalizationCoeff.toFixed(2) }}
      </span>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-between items-start mt-2 w-full">
      <div class="mt-1">
        <el-pagination
          v-if="!state?.initialLoading"
          :small="false"
          :total="state?.totalCount"
          :current-page="currentPage"
          :page-size="state?.recordsPerPage"
          :page-sizes="state?.pageSizes"
          :layout="paginationLayout"
          @current-change="() => {}"
          @size-change="onPageSizeChange"
          @click="onPaginationClick"
        />

        <div
          id="annot-count"
          class="mt-2"
        >
          <b>{{ state?.totalCount }}</b> matching {{ state?.totalCount == 1 ? 'record': 'records' }}
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
        <el-popover v-if="showCustomCols" class="mt-1" width="200"
                    trigger="click">
          <template #reference>
            <el-button class="select-btn-wrapper relative" @click="handleColSelectorClick">
              <new-feature-badge feature-key="custom-cols" custom-class="new-custom-badge">
                Columns
              </new-feature-badge>
              <el-icon class="el-icon-arrow-down select-btn-icon"><ArrowDown /></el-icon>
            </el-button>
          </template>
          <div>
            <div
              v-for="(column, i) in state.columns"
              :key="column.label"
              class="cursor-pointer select-none"
              @click="handleColumnClick(i)"
            >
              <template v-if="!column.hide">
                <el-icon v-if="column.selected" class="el-icon-check"><check /></el-icon>
                <el-icon v-else class="el-icon-check invisible"><check /></el-icon>
                <span v-if="column.src.includes('rho')"> &rho;<sub>{{ column.label }}</sub> </span>
                <span v-else>{{ column.label }}</span>
              </template>
            </div>
          </div>
        </el-popover>

        <div v-if="state?.isExporting" class="select-btn-wrapper ml-2 mt-1">
          <progress-button
            class="export-btn"
            :width="146"
            :height="42"
            :percentage="state?.exportProgress * 100"
            @click="abortExport"
          >
            Cancel
          </progress-button>
        </div>

        <el-popover v-else ref="exportPop" class="select-btn-wrapper ml-2 mt-1" popper-class="export-pop"
                    trigger="click">
          <template #reference>
            <el-button class="select-btn-wrapper relative" :width="146" :height="42">
              Export to CSV
              <el-icon class="el-icon-arrow-down select-btn-icon"><ArrowDown /></el-icon>
            </el-button>
          </template>

          <p class="export-option" @click="startExport">
            Annotations table
          </p>
          <p class="export-option" @click="startIntensitiesExport">
            Pixel intensities
          </p>
        </el-popover>

        <div v-if="showCustomCols" class="ml-2 mt-1">
          <el-button v-if="isFullScreen" class="full-screen-btn" @click="$emit('screen')">
            <full-screen class="full-screen-icon" />
          </el-button>
          <el-button v-else class="full-screen-btn" @click="$emit('screen')">
            <exit-full-screen class="full-screen-icon" />
          </el-button>
        </div>
      </div>
    </div>


  </el-row>
</template>

<script>
import {defineComponent, ref, reactive, computed, onMounted, watch, defineAsyncComponent, nextTick, inject} from 'vue';
import { useStore } from 'vuex';
import { ElIcon, ElRow, ElTable, ElTableColumn, ElPagination, ElButton } from 'element-plus';
import isSnapshot from "../../lib/isSnapshot";
import { readNpy } from '../../lib/npyHandler'
import safeJsonParse from '../../lib/safeJsonParse'
import { invert, isEqual, uniqBy } from 'lodash-es'
import config from '../../lib/config'
import {DefaultApolloClient} from "@vue/apollo-composable";
import {annotationListQuery, tableExportQuery} from "../../api/annotation";
import {useRoute, useRouter} from "vue-router";
import {getLocalStorage, setLocalStorage} from "../../lib/localStorage";
import NewFeatureBadge, { hideFeatureBadge } from '../../components/NewFeatureBadge'
import ProgressButton from './ProgressButton.vue'
import AnnotationTableMolName from './AnnotationTableMolName.vue'
import {Check, ArrowDown} from "@element-plus/icons-vue";
import formatCsvRow, { csvExportHeader, formatCsvTextArray, csvExportIntensityHeader } from '../../lib/formatCsvRow'
import * as FileSaver from 'file-saver'
import { getIonImage, loadPngFromUrl } from '../../lib/ionImageRendering'
import { getDatasetDiagnosticsQuery, getRoisQuery } from '../../api/dataset'


const FilterIcon = defineAsyncComponent(() =>
  import('../../assets/inline/filter.svg')
);

const FullScreen = defineAsyncComponent(() =>
  import('../../assets/inline/full_screen.svg')
);

const ExitFullScreen = defineAsyncComponent(() =>
  import('../../assets/inline/exit_full_screen.svg')
);

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


export default defineComponent({
  name: 'AnnotationTable',
  components: {
    ElRow,
    ElTable,
    ElTableColumn,
    FilterIcon,
    ElPagination,
    NewFeatureBadge,
    ProgressButton,
    FullScreen,
    Check,
    ElIcon,
    ArrowDown,
    ExitFullScreen,
    AnnotationTableMolName,
    ElButton
  },
  props: ['hideColumns', 'isFullScreen'],
  setup(props) {
    const apolloClient = inject(DefaultApolloClient);
    const store = useStore();
    const table = ref(null);
    const exportPop = ref(null);
    const showCustomCols = computed(() => config.features.custom_cols);
    const datasetIds = computed(() => store.getters.filter.datasetIds);

    const state = reactive({
      annotations: [],
      loading: false,
      currentPage: 1,
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
    })
    const route = useRoute()
    const router = useRouter()


    const formatMSM = (row) => row.msmScore.toFixed(3)

    const formatFDR = ({ fdrLevel }) => {
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
    }

    const tableLoading = computed(() => state.loading);
    const isLoading = computed(() => store.state.tableIsLoading);
    const isNormalized = computed(() => store.getters.settings?.annotationView?.normalization);
    const filter = computed(() => store.getters.filter)
    const numberOfPages = computed(() => Math.ceil(state.totalCount / state.recordsPerPage))

    const currentPage = computed(() => {

      if(store.getters.settings?.table?.currentPage > numberOfPages.value && numberOfPages.value !== 0){
        store.commit('setCurrentPage', numberOfPages.value)
      }

      return store.getters.settings?.table?.currentPage
    })
    const singleDatasetSelected = computed(() => {
      let isSimple = true
      for (const key in filter.value) {
        if (!filter.value[key]) {
          continue
        }
        if (['fdrLevel', 'minMSM', 'database', 'datasetIds', 'metadataType'].indexOf(key) === -1) {
          isSimple = false
          break
        }
      }
      return isSimple && filter.value.datasetIds && filter.value.datasetIds.length === 1
    })
    const orderBy = computed(() => store.getters.settings?.table?.order?.by)
    const sortingOrder = computed(() => store.getters.settings?.table?.order?.dir)
    const tableSort = computed(() => {
      return {
        prop: SORT_ORDER_TO_COLUMN[orderBy.value] || 'msmScore',
        order: sortingOrder.value?.toLowerCase(),
      }
    })
    const currentRowIndex = computed(() => store.getters.settings?.table?.row - 1)
    const paginationLayout = computed(() => {
      const { datasetIds } = filter.value
      const limitedSpace = datasetIds && datasetIds.length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    })
    const noColocJobError = computed(() => (queryVariables.value.filter.colocalizedWith ||
        queryVariables.value.filter.colocalizationSamples)
      && state.annotations.length === 0)

    const multipleDatasetsColocError = computed(() => {
      return (queryVariables.value.filter.colocalizedWith ||
          queryVariables.value.filter.colocalizationSamples)
        && store.getters.filter.datasetIds != null
        && store.getters.filter.datasetIds.length > 1
    })
    const showColocCol = computed(() => route.query.colo !== undefined)

    const queryVariables = computed(() => {
      const filter = store.getters.gqlAnnotationFilter
      const dFilter = store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = store.getters.gqlColocalizationFilter
      const query = store.getters.ftsQuery
      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        orderBy: orderBy.value,
        sortingOrder: sortingOrder.value,
        offset: Math.max(0, (currentPage.value - 1) * state.recordsPerPage) || 0,
        limit: state.recordsPerPage,
        countIsomerCompounds: config.features.isomers,
      }
    })

    const queryOptions = reactive({ enabled: !store.state.filterListsLoading })

    const updateColocSort = () => {
      // sort table to update selected sort ui when coloc filter applied from annotation view
      if (orderBy.value === 'ORDER_BY_COLOCALIZATION' && table.value && typeof table.value.sort === 'function') {
        setTimeout(() => {
          table.value.sort(SORT_ORDER_TO_COLUMN[orderBy.value], sortingOrder.value.toLowerCase());
        }, 0);
      }
    }

    const showDatasetRelatedColumns = () => {
      state.columns.find((col) => col.src === 'Group').selected = true
      state.columns.find((col) => col.src === 'Dataset').selected = true
    }

    const updateDatasetColumns = () => {
      // hide dataset related filters if dataset filter added
      if (Array.isArray(datasetIds.value) && datasetIds.value.length === 1 && showCustomCols.value) {
        hideDatasetRelatedColumns();
      } else if (showCustomCols.value) {
        // show dataset related filters if dataset filter removed
        showDatasetRelatedColumns();
      }
    }

    const updateColumns = () => {
      if (!showCustomCols.value) { // do not apply custom column settings
        return
      }

      const columns = state.columns

      if (route.query.cols && Array.isArray(route.query.cols.split(','))) { // load cols from url
        const persistedCols = route.query.cols.split(',')
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

      state.columns = columns
    }

    onMounted(() => {
      const nCells = (window.innerHeight - 150) / 43
      const pageSizes = state.pageSizes.filter(n => nCells >= n).slice(-1)
      if (state.pageSizes.length > 0) {
        state.recordsPerPage = pageSizes[0]
      }
      updateColumns()
      updateDatasetColumns()
      updateColocSort()
    })

    const executeQuery = async () => {
      state.loading = true
      try {
        const result = await apolloClient.query({
          query: annotationListQuery,
          variables: queryVariables.value,
          fetchPolicy: 'cache-first',
          throttle: 200,
        })
        const {data} = result
        if(!data){
          return
        }
        state.annotations = data?.allAnnotations || []
        state.totalCount = data?.countAnnotations || 0

        await nextTick()

        if (isSnapshot() && !state.loadedSnapshotAnnotations) {
          state.nextCurrentRowIndex = -1
          if (Array.isArray(store.state.snapshotAnnotationIds)) {
            if (store.state.snapshotAnnotationIds.length > 1) { // adds annotationFilter if multi mol
              updateFilter({ annotationIds: store.state.snapshotAnnotationIds })
            } else { // dont display filter if less than one annotation
              setTimeout(() => store.commit('removeFilter', 'annotationIds'), 500)
            }
            state.nextCurrentRowIndex = state.annotations?.findIndex((annotation) =>
              store.state.snapshotAnnotationIds.includes(annotation.id))
            state.loadedSnapshotAnnotations = true
          }
        }

        if (state.nextCurrentRowIndex !== null && state.nextCurrentRowIndex !== -1) {
          setCurrentRow(state.nextCurrentRowIndex)
          state.nextCurrentRowIndex = null
        } else if (state.nextCurrentRowIndex !== -1) {
          const curRow = getCurrentRow()
          if (!curRow.value) {
            setCurrentRow(currentRowIndex.value)
          }
        }
        // Move focus to the table so that keyboard navigation works, except when focus is on an input element
        const shouldMoveFocus = document.activeElement?.closest('input,select,textarea') == null
        if (table.value && shouldMoveFocus) {
          table.value?.$el.focus()
        }

        // load ROIs from db
        loadRois(uniqBy(data.allAnnotations, 'dataset.id').map((annotation) => annotation?.dataset.id))

        state.initialLoading = false
      } catch (e) {
        console.error(e)
      } finally {
        state.loading = false
      }
    }


    const hidden = (columnLabel) => {
      return (state.columns.findIndex((col) => col.src === columnLabel) === -1 || !showCustomCols.value)
        ? (props.hideColumns.indexOf(columnLabel) >= 0 || !state.columns.find((col) => col.src === columnLabel)?.selected)
        : !state.columns.find((col) => col.src === columnLabel)?.selected
    };

    const loadRois = (datasetIdsRoi) => {
      datasetIdsRoi.map(async(datasetId) => {
        try {
          const resp = await apolloClient.query({
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
          if (roi && Array.isArray(roi.features) && store.state.roiInfo[datasetId]) {
            store.commit('setRoiInfo', {
              key: datasetId,
              roi: roi.features.map((feature) => {
                return feature?.properties
                  ? { ...feature?.properties, allVisible: store.state.roiInfo?.visible } : {}
              }),
            })
          }
        } catch (e) {
          // pass
        }
      })
    }

    const updateFilter = (delta) => {
      const newFilter = Object.assign({}, filter.value, delta)
      store.commit('updateFilter', newFilter)
    }

    const setNormalizationData = async(currentAnnotation) => {
      if (!currentAnnotation) {
        return null
      }

      try {
        const resp = await apolloClient.query({
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

        store.commit('setNormalizationMatrix', {
          data,
          shape,
          metadata: metadata,
          type: 'TIC',
          showFullTIC: false,
          error: false,
        })
      } catch (e) {
        store.commit('setNormalizationMatrix', {
          data: null,
          shape: null,
          metadata: null,
          showFullTIC: null,
          type: 'TIC',
          error: true,
        })
      }
    }

    const filterGroup = (row) => {
      if (row.dataset.group != null) {
        updateFilter({ group: row.dataset.group.id })
      }
    };

    const getRowClass = ({ row }) => {
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
    }

    const getCurrentRow = () => {
      if (table.value) {
        const tblStore = table.value.store
        return tblStore.states.currentRow
      }
      return null
    }

    const onKeyDown = (event) => {
      const action = KEY_TO_ACTION[event.key]
      if (action) {
        event.preventDefault()
        return false
      }
      return true
    }

    const setCurrentRow = (rowIndex, rows = state.annotations) => {
      if (table.value && rows && rows.length) {
        table.value?.setCurrentRow(null)
        const nextIndex = rowIndex < 0 ? 0 : Math.min(rowIndex, rows.length - 1)
        table.value?.setCurrentRow(rows[nextIndex])
      }
    }

    const onKeyUp = (event) => {
      const action = KEY_TO_ACTION[event.key]
      if (!action) {
        return
      }

      // WARNING the code below relies on internals of el-table:
      // store.{states.currentRow, mutations.{setData, setCurrentRow}}
      const curRow = getCurrentRow()
      const curIdx = state.annotations.indexOf(curRow.value)

      if (action === 'up' && curIdx === 0) {
        if (currentPage.value === 1) {
          return
        }
        state.nextCurrentRowIndex = state.recordsPerPage - 1
        setCurrentPage(currentPage.value - 1)
        return
      }


      if (action === 'down' && curIdx === state.annotations.length - 1) {
        if (currentPage.value === numberOfPages.value) {
          return
        }

        state.nextCurrentRowIndex = 0
        setCurrentPage(currentPage.value + 1)
        return
      }

      if (action === 'left') {
        state.nextCurrentRowIndex = curIdx
        setCurrentPage(Math.max(1, currentPage.value - 1))
        return
      }

      if (action === 'right') {
        state.nextCurrentRowIndex = curIdx
        setCurrentPage(Math.min(numberOfPages.value, currentPage.value + 1))
        return
      }

      const delta = action === 'up' ? -1 : +1
      setCurrentRow(curIdx + delta)
    }

    const onSortChange = (event) => {
      if (!event.order) {
        const { prop, order } = tableSort.value
        // Skip the "unsorted" state by just inverting the last seen sort order
        table.value?.sort(prop, order === 'ascending' ? 'descending' : 'ascending')
        return
      }

      store.commit('setSortOrder', {
        by: COLUMN_TO_SORT_ORDER[event.prop] || orderBy.value,
        dir: event.order.toUpperCase(),
      })
    }

    const setCurrentRowIndex = (index) => {
      store.commit('setRow', index + 1)
    }

    const onCurrentRowChange = (row) => {
      // do not set initial row if loading from a snapshot (permalink)
      if (isSnapshot() && !state.loadedSnapshotAnnotations) {
        return null
      }

     store.commit('setAnnotation', row)

      if (row !== null) {
        setCurrentRowIndex(state.annotations.indexOf(row))
      }

      setNormalizationData(row)
    }

    const formatDatasetName = (row) => row.dataset.name
    const formatMZ = (row) => row.mz.toFixed(4)



    const filterDataset = (row)  => {
      updateFilter({ datasetIds: [row.dataset.id] })
    }

    const filterMZ = (row) => {
      updateFilter({ mz: row.mz.toFixed(4) })
    }

    const onPageSizeChange = (newSize) => {
      state.recordsPerPage = newSize
    }

    const onPaginationClick = async (event) => {
      let targetElement = event?.target;
      let pages = 1
      const regex = /.+(\d+) pages/;
      const match = regex.exec(targetElement.attributes['aria-label'].textContent);

      if (match && match[1]) {
        pages = parseInt(match[1], 10)
      }

      let page = targetElement.attributes['aria-label'].textContent.toLowerCase().includes('next') ?
       currentPage.value + pages : (
          targetElement.attributes['aria-label'].textContent.toLowerCase().includes('previous') ?
            currentPage.value - pages : parseInt(targetElement.innerText, 10))
      // ignore the initial "sync"
      if (page === currentPage.value || state.initialLoading) {
        return
      }

      setCurrentPage(page)

    }

    const startIntensitiesExport = async() => {
      if (exportPop.value && typeof exportPop.value.doClose === 'function') {
        exportPop.value?.doClose()
      }

      if (!store.state.annotation?.dataset?.id) { // no annotation selected
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

      const queryVariablesAux = {
        ...queryVariables.value,
        dFilter: {
          ...queryVariables.value.dFilter,
          ids: store.state.annotation?.dataset?.id,
        },
      }
      const chunkSize = state.csvChunkSize
      let offset = 0
      state.isExporting = true
      let totalCount = 1
      let fileCols
      let fileName
      let rows = ''

      while (state.isExporting && offset < totalCount) {
        const resp = await apolloClient.query({
          query: annotationListQuery,
          variables: { ...queryVariablesAux, limit: chunkSize, offset },
        })
        totalCount = resp.data.countAnnotations
        for (let i = 0; i < resp.data.allAnnotations.length; i++) {
          if (!state.isExporting) {
            return
          }
          offset += 1
          state.exportProgress = offset / totalCount
          const annotation = resp.data.allAnnotations[i]
          try {
            const { cols, row, dsName } = await formatIntensitiesRow(annotation,
              isNormalized.value
                ? store.state.normalization : undefined)
            if (!fileCols) {
              fileCols = formatCsvRow(cols)
              fileName = `${dsName.replace(/\s/g, '_')}_pixel_intensities${isNormalized.value
                ? '_tic_normalized' : ''}.csv`
            }
            rows += formatCsvRow(row)
          } catch (e) {
            // pass when fail to convert png
          }
        }
      }

      if (state.isExporting) {
        state.isExporting = false
        state.exportProgress = 0
        const csv = csvExportIntensityHeader(isNormalized.value) + fileCols + rows
        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, fileName)
      }

    }

    const abortExport = () => {
      state.isExporting = false
      state.exportProgress = 0
    }

    const startExport = async() => {
      if (exportPop.value && typeof exportPop.value.doClose === 'function') {
        exportPop.value?.doClose()
      }

      const chunkSize = state.csvChunkSize
      const includeColoc = !hidden('colocalizationCoeff')
      const includeOffSample = config.features.off_sample
      const includeIsobars = config.features.isobars
      const includeNeutralLosses = config.features.neutral_losses
      const includeChemMods = config.features.chem_mods
      const colocalizedWith = filter.value.colocalizedWith
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
          isotopeImages, isobars,
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

      const queryVariablesAux = { ...queryVariables.value }
      let offset = 0
      state.isExporting = true

      while (state.isExporting && offset < state.totalCount) {
        const resp = await apolloClient.query({
          query: tableExportQuery,
          variables: { ...queryVariablesAux, limit: chunkSize, offset },
        })
        state.exportProgress = offset / state.totalCount
        offset += chunkSize
        csv += resp.data.annotations.map(formatRow).join('')
      }

      if (state.isExporting) {
        state.isExporting = false
        state.exportProgress = 0

        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, 'metaspace_annotations.csv')
      }
    }

    const setCurrentPage = async(page) => {
      if (state.nextCurrentRowIndex === null) {
        state.nextCurrentRowIndex = 0
      }
      await store.commit('setCurrentPage', page)
    }

    const handleColSelectorClick = (e) => {
      e.stopPropagation()
      hideFeatureBadge('custom-cols')
    }


    const handleColumnClick = (index) => {
      state.columns[index].selected = !state.columns[index].selected
      const defaultCols = state.columns.filter((column) => column.default).map((column) => column.id)
      const selectedCols = state.columns.filter((column) => column.selected).map((column) => column.id)
      if (!isEqual(defaultCols, selectedCols)) {
        router.replace({ path: route.fullPath, query: {
            ...router.currentRoute.value.query,
            cols: selectedCols.join(',')
        } })
      } else {
        router.replace({ path: route.fullPath, query: {
            ...router.currentRoute.value.query,
            cols: undefined
        } })
      }

      setLocalStorage('annotationTableCols', state.columns)
    }


    const hideDatasetRelatedColumns = () => {
      if (Array.isArray(filter.value?.datasetIds) && filter.value?.datasetIds.length > 0) {
        state.columns.find((col) => col.src === 'Group').selected = false
        state.columns.find((col) => col.src === 'Dataset').selected = false
      }
    }


    watch(tableLoading, (isLoading) => {
      store.commit('updateAnnotationTableStatus', isLoading)
    });

    // Watch for changes in query variables or options and re-execute query
    watch([queryVariables, () => queryOptions.enabled], executeQuery)

    watch(() => route.query, () => {
     updateColocSort()
    }, { deep: true });

    watch(datasetIds, () => {
      updateDatasetColumns()
    });

    watch(() => route.query, () => {
     updateColumns()
    });


    // Return the reactive properties and methods
    return {
      state,
      isLoading,
      showCustomCols,
      formatMSM,
      tableSort,
      getRowClass,
      onKeyDown,
      onKeyUp,
      table,
      onSortChange,
      onCurrentRowChange,
      multipleDatasetsColocError,
      noColocJobError,
      singleDatasetSelected,
      filter,
      handleColumnClick,
      hidden,
      filterGroup,
      formatDatasetName,
      filterDataset,
      formatMZ,
      filterMZ,
      formatFDR,
      showColocCol,
      paginationLayout,
      onPageSizeChange,
      onPaginationClick,
      currentPage,
      handleColSelectorClick,
      exportPop,
      startExport,
      startIntensitiesExport,
      abortExport
    };
  },
});
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
  background-color: #c8ffc8 !important;
}

.el-table__body tr.fdr-10 > td.fdr-cell, .fdr-legend.fdr-10, .el-table__body tr.coloc-90 > td.coloc-cell {
  background-color: #e0ffe0 !important;
}

.el-table__body tr.fdr-20 > td.fdr-cell, .fdr-legend.fdr-20, .el-table__body tr.coloc-80 > td.coloc-cell {
  background-color: #ffe !important;
}

.el-table__body tr.fdr-50 > td.fdr-cell, .fdr-legend.fdr-50, .el-table__body tr.coloc-50 > td.coloc-cell {
  background-color: #fff5e0 !important;
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
    right: -39px !important;
    top: -13px !important;
  }
}
.select-btn-wrapper{
  @apply mt-1;
  width: 146px;
  height: 42px;
}

.export-pop{
  padding: 0 !important;
  min-width: 200px;
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
