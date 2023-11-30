<template>
  <el-row>
    <el-table
      id="annot-table"
      ref="table"
      v-loading="isLoading"
      :data="state.annotations"
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
      @sort-change="onSortChange">
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

    <div class="flex justify-between items-start mt-2">
      <div class="mt-1">
        <el-pagination
          v-if="!state.initialLoading"
          :small="false"
          :total="state.totalCount"
          :current-page="currentPage"
          :page-size="state.recordsPerPage"
          :page-sizes="state.pageSizes"
          :layout="paginationLayout"
          @current-change="() => {}"
          @size-change="onPageSizeChange"
          @click="onPaginationClick"
        />
      </div>

    </div>


  </el-row>
</template>

<script>
import {defineComponent, ref, reactive, computed, onMounted, watch, defineAsyncComponent, nextTick} from 'vue';
import { useStore } from 'vuex';
import { ElRow, ElTable, ElTableColumn, ElPagination, ElPopover, ElButton } from 'element-plus';
import isSnapshot from "../../lib/isSnapshot";
import { invert, uniqBy, isEqual, throttle } from 'lodash-es'
import config from '../../lib/config'
import {useQuery} from "@vue/apollo-composable";
import {getSystemHealthQuery} from "../../api/system";
import {annotationListQuery} from "../../api/annotation";
import {useRoute} from "vue-router";


const FilterIcon = defineAsyncComponent(() =>
  import('../../assets/inline/filter.svg')
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
    ElPagination
  },
  props: ['hideColumns', 'isFullScreen'],
  setup(props) {
    const store = useStore();
    const table = ref(null);

    const state = reactive({
      annotations: [],
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
    })
    const route = useRoute();



    const formatMSM = (row, col) => row.msmScore.toFixed(3)

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

    const isLoading = computed(() => store.state.tableIsLoading);
    const isNormalized = computed(() => store.getters.settings?.annotationView?.normalization);
    const filter = computed(() => store.getters.filter)
    const numberOfPages = computed(() => Math.ceil(state.totalCount / state.recordsPerPage))

    const currentPage = computed(() => {

      if(store.getters.settings.table.currentPage > numberOfPages.value && numberOfPages.value !== 0){
        store.commit('setCurrentPage', numberOfPages.value)
      }

      return store.getters.settings.table.currentPage
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
    const orderBy = computed(() => store.getters.settings.table.order.by)
    const sortingOrder = computed(() => store.getters.settings.table.order.dir)
    const tableSort = computed(() => {
      return {
        prop: SORT_ORDER_TO_COLUMN[orderBy.value] || 'msmScore',
        order: sortingOrder.value?.toLowerCase(),
      }
    })
    const currentRowIndex = computed(() => store.getters.settings.table.row - 1)
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
        offset: Math.max(0, (currentPage.value - 1) * state.recordsPerPage),
        limit: state.recordsPerPage,
        countIsomerCompounds: config.features.isomers,
      }
    })

    const queryOptions = reactive({ enabled: !store.state.filterListsLoading })

    const { result: annotationsResult, onResult: onAnnotationsResult, loading } = useQuery(annotationListQuery, queryVariables, {
      fetchPolicy: 'cache-first',
      throttle: 200,
      enabled: queryOptions.enabled,
    });

    watch(loading, (isLoading) => {
      store.commit('updateAnnotationTableStatus', isLoading)
    });

    onAnnotationsResult(async(result) => {
      const {data} = result
      await nextTick()
      state.annotations = data?.allAnnotations || []
      state.totalCount = data?.countAnnotations || 0
      state.initialLoading = false
    })

    const hidden = (columnLabel) => {
      return (state.columns.findIndex((col) => col.src === columnLabel) === -1 || !state.showCustomCols)
        ? (props.hideColumns.indexOf(columnLabel) >= 0 || !state.columns.find((col) => col.src === columnLabel)?.selected)
        : !state.columns.find((col) => col.src === columnLabel)?.selected
    };


    const updateFilter = (delta) => {
      const newFilter = Object.assign({}, filter.value, delta)
      store.commit('updateFilter', newFilter)
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

    const onKeyDown = (event) => {
      const action = KEY_TO_ACTION[event.key]
      if (action) {
        event.preventDefault()
        return false
      }
      return true
    }

    const onKeyUp = (event) => {
      const action = KEY_TO_ACTION[event.key]
      if (!action) {
        return
      }

    }

    const onSortChange = (event) => {

    }

    const onCurrentRowChange = (row) => {

    }

    const formatDatasetName = (row, col) => row.dataset.name
    const formatMZ = (row, col) => row.mz.toFixed(4)



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
      if (state.nextCurrentRowIndex === null) {
        state.nextCurrentRowIndex = 0
      }
      await store.commit('setCurrentPage', page)
    }

    // Return the reactive properties and methods
    return {
      state,
      isLoading,
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
