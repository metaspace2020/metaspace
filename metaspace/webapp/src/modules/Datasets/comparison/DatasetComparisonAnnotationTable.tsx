import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from '@vue/composition-api'
import './DatasetComparisonAnnotationTable.scss'
import { Table, TableColumn, Pagination, Button, Popover } from '../../../lib/element-ui'
import ProgressButton from '../../Annotations/ProgressButton.vue'
import AnnotationTableMolName from '../../Annotations/AnnotationTableMolName.vue'
import { findIndex, orderBy } from 'lodash-es'
import config from '../../../lib/config'
import FileSaver from 'file-saver'
import formatCsvRow, { csvExportHeader, formatCsvTextArray } from '../../../lib/formatCsvRow'
import { getLocalStorage, setLocalStorage } from '../../../lib/localStorage'
import FullScreen from '../../../assets/inline/full_screen.svg'
import ExitFullScreen from '../../../assets/inline/exit_full_screen.svg'
import Vue from 'vue'

interface DatasetComparisonAnnotationTableProps {
  annotations: any[]
  isExporting: boolean
  isLoading: boolean
  coloc: boolean
  filter: any
  exportProgress: number
}

interface DatasetComparisonAnnotationTableState {
  processedAnnotations: any
  selectedRow: any
  currentRowIndex: number
  pageSize: number
  offset: number
  keyListenerAdded: boolean
  isExporting: boolean
  isFullScreen: boolean
  exportProgress: number
  columns: any
}

const KEY_TO_ACTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const SORT_ORDER_TO_COLUMN = {
  ORDER_BY_FORMULA: 'sumformula',
  ORDER_BY_ADDUCT: 'adduct',
  ORDER_BY_MSM: 'msmscore',
  ORDER_BY_MZ: 'mz',
  ORDER_BY_DS_COUNT: 'datasetcount',
  ORDER_BY_INTENSITY: 'maxIntensity',
  ORDER_BY_ISOBARS: 'isobarsCount',
  ORDER_BY_ISOMERS: 'isomersCount',
  ORDER_BY_FDR_MSM: 'fdrlevel',
  ORDER_BY_COLOCALIZATION: 'colocalization',
}

const COMPARISON_TABLE_COLUMNS = {
  sumformula:
    {
      label: 'Annotation',
      src: 'sumformula',
      selected: true,
    },
  adduct:
    {
      label: 'Adduct',
      src: 'adduct',
      selected: false,
    },
  msmscore:
    {
      label: 'Best MSM',
      src: 'msmscore',
      selected: true,
    },
  mz:
    {
      label: 'm/z',
      src: 'mz',
      selected: true,
    },
  datasetcount:
    {
      label: 'Datasets #',
      src: 'datasetcount',
      selected: true,
    },
  isomersCount:
    {
      label: 'Isomers',
      src: 'isomersCount',
      selected: false,
    },
  isobarsCount:
    {
      label: 'Isobars',
      src: 'isobarsCount',
      selected: false,
    },
  maxIntensity:
    {
      label: 'Max Intensity',
      src: 'maxIntensity',
      selected: false,
    },
  possibleCompounds:
    {
      label: 'Molecules',
      src: 'possibleCompounds',
      selected: false,
    },
  fdrlevel:
    {
      label: 'Best FDR',
      src: 'fdrlevel',
      selected: true,
    },
  colocalization:
    {
      label: 'Coloc.',
      src: 'colocalization',
      selected: false,
      hide: true,
    },
}

export const DatasetComparisonAnnotationTable = defineComponent<DatasetComparisonAnnotationTableProps>({
  name: 'DatasetComparisonAnnotationTable',
  props: {
    annotations: {
      type: Array,
      default: () => [],
    },
    exportProgress: {
      type: Number,
      default: 0,
    },
    isLoading: {
      type: Boolean,
    },
    isExporting: {
      type: Boolean,
      default: false,
    },
    coloc: {
      type: Boolean,
      default: false,
    },
  },
  setup: function(props, { emit, root }) {
    const { $store, $route } = root
    const table : any = ref(null)
    const exportPop :any = ref<any>(null)
    const pageSizes = [15, 20, 25, 30]
    const state = reactive<DatasetComparisonAnnotationTableState>({
      selectedRow: props.annotations[0],
      currentRowIndex: -1,
      pageSize: 15,
      offset: 0,
      processedAnnotations: computed(() => props.annotations.slice()),
      keyListenerAdded: false,
      isExporting: false,
      isFullScreen: false,
      exportProgress: 0,
      columns: COMPARISON_TABLE_COLUMNS,
    })

    const onKeyUp = (event: any) => {
      const shouldMoveFocus = document.activeElement?.closest('input,select,textarea') == null
      if (!shouldMoveFocus) { // ignore event if focused on filters
        return
      }

      // @ts-ignore
      const action : string = KEY_TO_ACTION[event.key]

      if (!action) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const currentRowIndex = getCurrentRowIndex()
      const currentDataIndex = getDataItemIndex()

      if (action === 'up' && currentRowIndex === 0) {
        if (state.offset === 1) {
          return
        }
        state.selectedRow = state.processedAnnotations[currentDataIndex - 1]
        onPageChange(state.offset - 1, true)
        return
      }

      if (action === 'down' && currentRowIndex === state.pageSize - 1) {
        if (state.offset === getNumberOfPages()) {
          return
        }
        state.selectedRow = state.processedAnnotations[currentDataIndex + 1]
        onPageChange(state.offset + 1, true)
        return
      }

      if (action === 'left') {
        onPageChange(Math.max(1, state.offset - 1))
        return
      }

      if (action === 'right') {
        onPageChange(Math.min(getNumberOfPages(), state.offset + 1))
        return
      }

      const delta = action === 'up' ? -1 : +1
      let newIdx = Math.max(0, currentDataIndex + delta)
      newIdx = Math.min(newIdx, props.annotations.length - 1)
      state.selectedRow = state.processedAnnotations[newIdx]
      handleCurrentRowChange(state.selectedRow)
    }

    const loadCustomCols = () => {
      const localColSettings : any = getLocalStorage('comparisonTableCols')
      const columns : any = state.columns
      if (localColSettings) {
        Object.keys(localColSettings).forEach((colKey: string) => {
          if (columns[colKey]) {
            columns[colKey].selected = localColSettings[colKey].selected
          }
        })
      }
      state.columns = columns
    }

    onMounted(() => {
      initializeTable()
      loadCustomCols()
      if (!state.keyListenerAdded) {
        state.keyListenerAdded = true
        window.addEventListener('keyup', onKeyUp)
      }
    })

    onUnmounted(() => {
      if (state.keyListenerAdded) {
        state.keyListenerAdded = false
        window.removeEventListener('keyup', onKeyUp)
      }
    })

    watch(() => props.isLoading, (newValue, oldValue) => {
      if (newValue === true && oldValue === false) { // check for filter updates to re-render
        initializeTable()
      }
    })

    const sortMolecule = (a: any, b: any, order: number) => {
      const re = /(\D+\d*)/i
      const reA = /[^a-zA-Z]/g
      const reN = /[^0-9]/g
      let aFormula = a.ionFormula
      let bFormula = b.ionFormula
      let aMatch = aFormula.match(re)
      let bMatch = bFormula.match(re)
      let aMolecule = aMatch[1]
      let bMolecule = bMatch[1]

      while (aFormula && bFormula && aMolecule === bMolecule) { // if equal evaluate next molecule until not equal
        aFormula = aFormula.substring(aMatch.length + 1, aFormula.length)
        bFormula = bFormula.substring(bMatch.length + 1, bFormula.length)
        aMatch = aFormula.match(re)
        bMatch = bFormula.match(re)

        if (!bMatch) { // return shortest as first, if different matches are over
          return -(order)
        } else if (!aMatch) {
          return order
        }

        aMolecule = aMatch[1]
        bMolecule = bMatch[1]
      }

      const aA = aMolecule.replace(reA, '')
      const bA = bMolecule.replace(reA, '')

      if (aA === bA) {
        const aN = parseInt(aMolecule.replace(reN, ''), 10)
        const bN = parseInt(bMolecule.replace(reN, ''), 10)
        return aN === bN ? 0 : aN > bN ? (order) : -(order)
      } else {
        return aA > bA ? order : -(order)
      }
    }

    const handleSortFormula = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        sortMolecule(a, b, order === 'ascending' ? 1 : -1)))
    }

    const handleSortMZ = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.mz - b.mz)))
    }

    const handleSortIntensity = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.maxIntensity - b.maxIntensity)))
    }

    const handleSortIsobars = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.isobarsCount - b.isobarsCount)))
    }

    const handleSortIsomers = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.isomersCount - b.isomersCount)))
    }

    const handleSortColoc = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.colocalization - b.colocalization)))
    }

    const handleSortMSM = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.msmScore - b.msmScore)))
    }
    const handleSortAdduct = (order: string) => {
      state.processedAnnotations = computed(() =>
        orderBy(props.annotations, [(annotation: any) => annotation.adduct.toLowerCase()
          .replace('+', '').replace('-', '')], [order === 'ascending'
          ? 'asc' : 'desc']))
    }

    const handleSortDsCount = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.datasetcount - b.datasetcount)))
    }

    const handleSortFdr = (order: string) => {
      state.processedAnnotations = computed(() => props.annotations.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.fdrLevel - b.fdrLevel)))
    }

    const handleSortChange = (settings: any, setCurrentRow: boolean = true) => {
      const { prop, order } = settings
      if (!order) {
        state.processedAnnotations = computed(() => props.annotations)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FORMULA) {
        handleSortFormula(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ADDUCT) {
        handleSortAdduct(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MSM) {
        handleSortMSM(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM) {
        handleSortFdr(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_DS_COUNT) {
        handleSortDsCount(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MZ) {
        handleSortMZ(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_INTENSITY) {
        handleSortIntensity(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ISOBARS) {
        handleSortIsobars(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ISOMERS) {
        handleSortIsomers(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_COLOCALIZATION) {
        handleSortColoc(order)
      }

      $store.commit('setSortOrder', {
        by: prop,
        dir: order?.toUpperCase(),
      })

      if (setCurrentRow) {
        state.selectedRow = state.processedAnnotations[0]
        onPageChange(1)
      }
    }

    const forceSortUiUpdate = (order: string, prop: string) => {
      setTimeout(() => {
        handleSortChange({ order: order, prop: prop })
        Vue.nextTick()
        if (
          table.value
          && typeof table.value.sort === 'function') {
          table.value.sort(prop, order)
        }
      }, 1000)
    }

    watch(() => props.coloc, (newValue, oldValue) => {
      if (props.coloc) {
        Vue.set(state, 'columns', {
          ...state.columns,
          colocalization: {
            ...state.columns.colocalization,
            hide: false,
            selected: true,
          },
        })
        setLocalStorage('comparisonTableCols', state.columns)
        forceSortUiUpdate('descending', SORT_ORDER_TO_COLUMN.ORDER_BY_COLOCALIZATION)
      } else {
        const { sort } = $route.query
        Vue.set(state, 'columns', {
          ...state.columns,
          colocalization: {
            ...state.columns.colocalization,
            hide: true,
            selected: false,
          },
        })
        setLocalStorage('comparisonTableCols', state.columns)
        if (
          (oldValue && !newValue)
          || (sort && sort.replace('-', '') === SORT_ORDER_TO_COLUMN.ORDER_BY_COLOCALIZATION)) {
          forceSortUiUpdate('ascending', SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM)
        }
      }
    })

    const initializeTable = () => {
      const { sort, row, page } = $route.query
      const order = sort?.indexOf('-') === 0 ? 'descending' : 'ascending'
      const prop = sort ? sort.replace('-', '') : SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM
      handleSortChange({ order, prop }, false)

      state.selectedRow = row ? props.annotations[parseInt(row, 10)]
        : state.processedAnnotations[0]
      onPageChange(page ? parseInt(page, 10) : 1, true)
    }

    const clearCurrentRow = () => {
      const currentRows = document.querySelectorAll('.current-row')
      if (currentRows) {
        currentRows.forEach((currentRow) => {
          currentRow.classList.remove('current-row')
        })
      }
    }

    const getCurrentRowIndex = () => {
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      return findIndex(state.processedAnnotations.slice(dataStart, dataEnd),
        (annotation: any) => { return state.selectedRow?.id === annotation?.id })
    }

    const getDataItemIndex = () => {
      return findIndex(state.processedAnnotations,
        (annotation: any) => { return state.selectedRow?.id === annotation?.id })
    }

    const getNumberOfPages = () => {
      return Math.ceil(props.annotations.length / state.pageSize)
    }

    const setCurrentRow = () => {
      clearCurrentRow()
      const currentIndex = getCurrentRowIndex()
      // guarantee old selection was removed
      if (state.currentRowIndex !== currentIndex && state.currentRowIndex !== -1) {
        setTimeout(() => {
          if (
            document.querySelectorAll('.el-table__row')
            && document.querySelectorAll('.el-table__row').length > state.currentRowIndex
            && document.querySelectorAll('.el-table__row')[state.currentRowIndex]
          ) {
            document.querySelectorAll('.el-table__row')[state.currentRowIndex]
              .classList.remove('current-row')
          }
          state.currentRowIndex = currentIndex
        }, 100)
      }

      if (currentIndex !== -1) {
        // gives time to clear and render the new selection
        setTimeout(() => {
          if (
            document.querySelectorAll('.el-table__row')
            && document.querySelectorAll('.el-table__row').length > currentIndex
            && document.querySelectorAll('.el-table__row')[currentIndex]
          ) {
            document.querySelectorAll('.el-table__row')[currentIndex].classList.add('current-row')
          }
        }, 100)
      }
    }

    const getDefaultTableSort = () => {
      const { sort } = $route.query

      return {
        prop: sort ? sort.replace('-', '') : SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM,
        order: sort?.indexOf('-') === 0 ? 'descending' : 'ascending',
      }
    }

    const handleFullScreenChange = () => {
      state.isFullScreen = !state.isFullScreen
      emit('screen', state.isFullScreen)
    }

    const handleSelectCol = (src: string) => {
      if (state.columns[src]) {
        state.columns[src].selected = !state.columns[src].selected
        setLocalStorage('comparisonTableCols', state.columns)
      }
    }

    const handleCurrentRowChange = (row: any) => {
      if (row) {
        state.selectedRow = row
        const currentIndex = findIndex(props.annotations,
          (annotation) => { return row.id === annotation.id })

        if (state.currentRowIndex === -1) {
          state.currentRowIndex = currentIndex
        }

        if (currentIndex !== -1) {
          $store.commit('setRow', currentIndex)
          $store.commit('setRow', currentIndex)
          emit('rowChange', currentIndex)
          // for same reason setCurrentRow and clearSelection are not working so
          // I had to add the current row class by hand
          setCurrentRow()
        }
      }
    }

    const onPageSizeChange = (newSize: number) => {
      state.pageSize = newSize
    }

    const onPageChange = (newPage: number, fromUpDownArrow : boolean = false) => {
      const currentDataIndex = getDataItemIndex()

      // right
      if (!fromUpDownArrow && newPage > state.offset) {
        const newIndex = Math.min(currentDataIndex + (state.pageSize * (newPage - state.offset)),
          props.annotations.length - 1)
        state.selectedRow = state.processedAnnotations[newIndex]
      } else if (!fromUpDownArrow && newPage < state.offset) { // left
        const newIndex = Math.max(0, currentDataIndex - (state.pageSize * (state.offset - newPage)))
        state.selectedRow = state.processedAnnotations[newIndex]
      } else if (currentDataIndex === -1 && state.processedAnnotations.length > 0) { // keep row selected
        state.selectedRow = state.processedAnnotations[0]
      }

      newPage = newPage < 1 ? 1 : newPage
      // reset to page 1 when page saved on url but not enough annotations (filter cases)
      newPage = ((newPage - 1) * state.pageSize) >= state.processedAnnotations.length ? 1 : newPage
      state.offset = newPage

      $store.commit('setCurrentPage', newPage)
      handleCurrentRowChange(state.selectedRow)
    }

    const isColSelected = (src: string) => {
      return state.columns[src]?.selected
    }

    const renderMSMHeader = () => {
      return <div class="msm-header">
        Best MSM
        <Popover
          trigger="hover"
          placement="right"
        >
          <i
            slot="reference"
            class="el-icon-question metadata-help-icon ml-1"
          />
          Highest MSM among the datasets.
        </Popover>
      </div>
    }

    const renderFDRHeader = () => {
      return <div class="msm-header">
        Best FDR
        <Popover
          trigger="hover"
          placement="right"
        >
          <i
            slot="reference"
            class="el-icon-question metadata-help-icon ml-1"
          />
          Lowest FDR among the datasets.
        </Popover>
      </div>
    }

    const renderMaxIntensityHeader = () => {
      return <div class="msm-header">
        Best {state.columns.maxIntensity?.label}
        <Popover
          trigger="hover"
          placement="right"
        >
          <i
            slot="reference"
            class="el-icon-question metadata-help-icon ml-1"
          />
          Highest {state.columns.maxIntensity?.label} among the datasets.
        </Popover>
      </div>
    }

    const renderMaxColocHeader = () => {
      return <div class="msm-header">
        Best {state.columns.colocalization?.label}
        <Popover
          trigger="hover"
          placement="right"
        >
          <i
            slot="reference"
            class="el-icon-question metadata-help-icon ml-1"
          />
          Highest {state.columns.colocalization?.label} among the datasets.
        </Popover>
      </div>
    }

    const formatAnnotation = (row: any) => {
      return <AnnotationTableMolName annotation={row} highlightByIon/>
    }

    const formatMSM = (row: any) => {
      return row.msmScore.toFixed(3)
    }

    const formatMolecules = (row: any) => {
      return row.possibleCompounds?.map((molecule: any) => molecule.name).join(', ')
    }

    const formatMZ = (row: any) => {
      return row.mz.toFixed(4)
    }

    const formatFDR = (row: any) => {
      return row.fdrLevel ? <span>{Math.round(row.fdrLevel * 100)}%</span> : <span>&mdash;</span>
    }

    const formatMaxIntensity = (row: any) => {
      return <span>{row.maxIntensity?.toFixed(1)}</span>
    }

    const formatColoc = (row: any) => {
      return <span>{row.colocalization?.toFixed(2)}</span>
    }

    const getRowClass = (info: any) => {
      const { row } = info
      const { fdrLevel, colocalization } = row
      const fdrClass =
        fdrLevel == null ? 'fdr-null'
          : fdrLevel <= 0.051 ? 'fdr-5'
            : fdrLevel <= 0.101 ? 'fdr-10'
              : fdrLevel <= 0.201 ? 'fdr-20'
                : 'fdr-50'
      const colocClass =
        (colocalization === null || colocalization === 0) ? ''
          : colocalization >= 0.949 ? 'coloc-95'
            : colocalization >= 0.899 ? 'coloc-90'
              : colocalization >= 0.799 ? 'coloc-80'
                : 'coloc-50'

      return `${fdrClass} ${colocClass}`
    }

    const paginationLayout = () => {
      const { datasetIds } = props.filter || {}
      const limitedSpace = datasetIds && datasetIds.length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    }

    const startIntensitiesExport = async() => {
      if (exportPop && exportPop.value && typeof exportPop.value.doClose === 'function') {
        exportPop.value.doClose()
      }
      emit('export')
    }

    const startExport = async() => {
      if (exportPop && exportPop.value && typeof exportPop.value.doClose === 'function') {
        exportPop.value.doClose()
      }

      const includeColoc = false
      const includeOffSample = config.features.off_sample
      const includeIsomers = config.features.isomers
      const includeIsobars = config.features.isobars
      const includeNeutralLosses = config.features.neutral_losses
      const includeChemMods = config.features.chem_mods
      const colocalizedWith = props.filter?.colocalizedWith

      let csv = csvExportHeader()

      const columns = ['group', 'datasetName', 'datasetId', 'formula', 'adduct',
        ...(includeChemMods ? ['chemMod'] : []),
        ...(includeNeutralLosses ? ['neutralLoss'] : []),
        'ion', 'mz', 'msm', 'fdr', 'rhoSpatial', 'rhoSpectral', 'rhoChaos',
        'moleculeNames', 'moleculeIds', 'minIntensity', 'maxIntensity', 'totalIntensity']
      if (includeColoc) {
        columns.push('colocalization')
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

      function databaseId(compound : any) {
        return compound.information[0].databaseId
      }

      function formatRow(row : any) {
        const {
          dataset, sumFormula, adduct, chemMod, neutralLoss, ion, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos, possibleCompounds,
          isotopeImages, isomers, isobars,
          offSample, offSampleProb, colocalization,
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
          formatCsvTextArray(possibleCompounds.map((m: any) => m.name)),
          formatCsvTextArray(possibleCompounds.map(databaseId)),
          isotopeImages[0] && isotopeImages[0].minIntensity,
          isotopeImages[0] && isotopeImages[0].maxIntensity,
          isotopeImages[0] && isotopeImages[0].totalIntensity,
        ]
        if (includeColoc) {
          cells.push(colocalizedWith === ion ? 'Reference annotation' : colocalization)
        }
        if (includeOffSample) {
          cells.push(offSample, offSampleProb)
        }
        if (includeIsomers) {
          cells.push(formatCsvTextArray(isomers.map((isomer : any) => isomer.ion)))
        }
        if (includeIsobars) {
          cells.push(formatCsvTextArray(isobars.map((isobar : any) => isobar.ion)))
        }

        return formatCsvRow(cells)
      }

      state.isExporting = true

      state.processedAnnotations.forEach((annotation: any) => {
        csv += annotation.rawAnnotations.map(formatRow).join('')
      })

      if (state.isExporting) {
        state.isExporting = false
        state.exportProgress = 0

        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, 'metaspace_annotations.csv')
      }
    }

    const abortExport = () => {
      state.isExporting = false
      state.exportProgress = 0
      emit('abort')
    }

    return () => {
      const totalCount = props.annotations.length
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      if (props.isLoading) {
        return (
          <div class='ds-comparison-annotation-table-loading-wrapper'>
            <i
              class="el-icon-loading"
            />
          </div>
        )
      }

      return (
        <div class="dataset-comparison-annotation-table relative">
          <Table
            id="annot-table"
            ref={table}
            data={state.processedAnnotations.slice(dataStart, dataEnd)}
            rowClassName={getRowClass}
            size="mini"
            border
            current
            elementLoadingText="Loading results …"
            highlightCurrentRow
            width="100%"
            stripe
            tabindex="1"
            defaultSort={getDefaultTableSort()}
            {...{
              on: {
                'current-change': handleCurrentRowChange,
                'sort-change': handleSortChange,
              },
            }}
          >
            {
              isColSelected('sumformula')
              && <TableColumn
                key="sumFormula"
                property="sumformula"
                label={state.columns.sumformula?.label}
                sortable={'custom'}
                sortMethod={handleSortFormula}
                minWidth="120"
                formatter={(row: any) => formatAnnotation(row)}
              />
            }
            {
              isColSelected('adduct')
              && <TableColumn
                key="adduct"
                property="adduct"
                label={state.columns.adduct?.label}
                sortable={'custom'}
                minWidth="100"
              />
            }
            {
              isColSelected('msmscore')
              && <TableColumn
                key="msmScore"
                property="msmscore"
                label={state.columns.msmscore?.label}
                sortable="custom"
                minWidth="120"
                renderHeader={renderMSMHeader}
                formatter={(row: any) => formatMSM(row)}
              />
            }
            {
              isColSelected('possibleCompounds')
              && <TableColumn
                key="possibleCompounds"
                property="possibleCompounds"
                label={state.columns.possibleCompounds?.label}
                sortable="false"
                minWidth="120"
                showOverflowTooltip
                formatter={(row: any) => formatMolecules(row)}
              />
            }
            {
              isColSelected('mz')
              && <TableColumn
                key="mz"
                property="mz"
                label={state.columns.mz?.label}
                sortable="custom"
                minWidth="60"
                formatter={(row: any) => formatMZ(row)}
              />
            }
            {
              isColSelected('datasetcount')
              && <TableColumn
                key="datasetCount"
                property="datasetcount"
                label={state.columns.datasetcount?.label}
                sortable="custom"
                minWidth="100"
              />
            }
            {
              isColSelected('isomersCount')
              && <TableColumn
                key="isomersCount"
                property="isomersCount"
                label={state.columns.isomersCount?.label}
                sortable="custom"
                minWidth="100"
              />
            }
            {
              isColSelected('isobarsCount')
              && <TableColumn
                key="isobarsCount"
                property="isobarsCount"
                label={state.columns.isobarsCount?.label}
                sortable="custom"
                minWidth="100"
              />
            }
            {
              isColSelected('maxIntensity')
              && <TableColumn
                key="maxIntensity"
                property="maxIntensity"
                label={state.columns.maxIntensity?.label}
                className="fdr-cell"
                sortable="custom"
                minWidth="200"
                renderHeader={renderMaxIntensityHeader}
                formatter={(row: any) => formatMaxIntensity(row)}
              />
            }
            {
              isColSelected('colocalization')
              && <TableColumn
                key="colocalization"
                property="colocalization"
                label={state.columns.colocalization?.label}
                class-name="coloc-cell"
                sortable="custom"
                minWidth="140"
                renderHeader={renderMaxColocHeader}
                formatter={(row: any) => formatColoc(row)}
              />
            }
            {
              isColSelected('fdrlevel')
              && <TableColumn
                key="fdrLevel"
                property="fdrlevel"
                label={state.columns.fdrlevel?.label}
                className="fdr-cell"
                sortable="custom"
                minWidth="120"
                renderHeader={renderFDRHeader}
                formatter={(row: any) => formatFDR(row)}
              />
            }
          </Table>
          <div class="flex justify-between items-start mt-2">
            <div>
              <Pagination
                total={totalCount}
                pageSize={state.pageSize}
                pageSizes={pageSizes}
                currentPage={state.offset}
                {...{ on: { 'update:currentPage': onPageChange } }}
                {...{ on: { 'update:pageSize': onPageSizeChange } }}
                layout={paginationLayout()}
              />
              <div
                id="annot-count"
                class="mt-2">
                <b>{ totalCount }</b> matching { totalCount === 1 ? 'record' : 'records' }
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
              <Popover class="mt-1">
                <Button
                  slot="reference"
                  class="select-btn-wrapper relative"
                >
                  Columns
                  <i class="el-icon-arrow-down select-btn-icon" />
                </Button>
                <div
                  class="cursor-pointer select-none"
                >
                  {
                    Object.values(state.columns).map((column: any) => {
                      if (column.hide) {
                        return null
                      }
                      return <div onClick={() => { handleSelectCol(column.src) }}
                      >
                        {
                          column.selected
                          && <i
                            class="el-icon-check"
                          />
                        }
                        {
                          !column.selected
                          && <i
                            class="el-icon-check invisible"
                          />
                        }
                        <span>{column.label}</span>
                      </div>
                    })
                  }
                </div>

              </Popover>
              {
                (state.isExporting || props.isExporting)
                && <div class="select-btn-wrapper ml-2 mt-1">
                  <ProgressButton
                    class="export-btn"
                    width={146}
                    height={42}
                    percentage={(props.exportProgress || state.exportProgress) * 100}
                    onClick={abortExport}
                  >
                    Cancel
                  </ProgressButton>
                </div>
              }
              {
                !(state.isExporting || props.isExporting)
                && <Popover
                  ref={exportPop}
                  class="select-btn-wrapper ml-2 mt-1"
                  popper-class="export-pop">
                  <div slot="reference">
                    <Button
                      class="select-btn-wrapper relative"
                      width={146}
                      height={42}
                    >
                      Export to CSV
                      <i class="el-icon-arrow-down select-btn-icon" />
                    </Button>
                  </div>
                  <p
                    class="export-option"
                    onClick={startExport}
                  >
                    Annotations table
                  </p>
                  <p
                    class="export-option"
                    onClick={startIntensitiesExport}
                  >
                    Pixel intensities
                  </p>
                </Popover>
              }
              <div
                class="ml-2 mt-1"
              >
                {
                  state.isFullScreen
                  && <Button
                    class="full-screen-btn"
                    onClick={handleFullScreenChange}
                  >
                    <FullScreen
                      class="full-screen-icon"
                    />
                  </Button>
                }
                {
                  !state.isFullScreen
                  && <Button
                    class="full-screen-btn"
                    onClick={handleFullScreenChange}
                  >
                    <ExitFullScreen
                      class="full-screen-icon"
                    />
                  </Button>
                }
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
