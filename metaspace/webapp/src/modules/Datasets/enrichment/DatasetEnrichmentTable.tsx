import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from '@vue/composition-api'
import { Table, TableColumn, Pagination, Button, Popover } from '../../../lib/element-ui'
import ProgressButton from '../../Annotations/ProgressButton.vue'
import AnnotationTableMolName from '../../Annotations/AnnotationTableMolName.vue'
import { findIndex } from 'lodash-es'
import config from '../../../lib/config'
import FileSaver from 'file-saver'
import formatCsvRow, { csvExportHeader, formatCsvTextArray } from '../../../lib/formatCsvRow'
import ExternalWindowSvg from '../../../assets/inline/refactoring-ui/icon-external-window.svg'
import './DatasetEnrichmentTable.scss'

interface DatasetEnrichmentTableProps {
  data: any[]
  isLoading: boolean
  filter: any
}

interface DatasetEnrichmentTableState {
  processedAnnotations: any
  selectedRow: any
  currentRowIndex: number
  pageSize: number
  offset: number
  keyListenerAdded: boolean
  isExporting: boolean
  exportProgress: number
}

const KEY_TO_ACTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const SORT_ORDER_TO_COLUMN = {
  ORDER_BY_ID: 'id',
  ORDER_BY_NAME: 'name',
  ORDER_BY_N: 'n',
  ORDER_BY_FDR_MSM: 'qValue',
}

export const DatasetEnrichmentTable = defineComponent<DatasetEnrichmentTableProps>({
  name: 'DatasetEnrichmentTable',
  props: {
    data: {
      type: Array,
      default: () => [],
    },
    isLoading: {
      type: Boolean,
    },
  },
  setup: function(props, { emit, root }) {
    const { $store, $route } = root
    const table = ref(null)
    const pageSizes = [15, 20, 25, 30]
    const state = reactive<DatasetEnrichmentTableState>({
      selectedRow: props.data[0],
      currentRowIndex: -1,
      pageSize: 15,
      offset: 0,
      processedAnnotations: computed(() => props.data.slice()),
      keyListenerAdded: false,
      isExporting: false,
      exportProgress: 0,
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
      newIdx = Math.min(newIdx, props.data.length - 1)
      state.selectedRow = state.processedAnnotations[newIdx]
      handleCurrentRowChange(state.selectedRow)
    }

    onMounted(() => {
      initializeTable()
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

    const initializeTable = () => {
      const { sort, row, page } = $route.query
      const order = sort?.indexOf('-') === 0 ? 'descending' : 'ascending'
      const prop = sort ? sort.replace('-', '') : SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM
      handleSortChange({ order, prop }, false)

      state.selectedRow = row ? props.data[parseInt(row, 10)]
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
      return Math.ceil(props.data.length / state.pageSize)
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

    const handleCurrentRowChange = (row: any) => {
      if (row) {
        state.selectedRow = row
        const currentIndex = findIndex(props.data,
          (annotation) => { return row.id === annotation.id })

        if (state.currentRowIndex === -1) {
          state.currentRowIndex = currentIndex
        }

        if (currentIndex !== -1) {
          $store.commit('setRow', currentIndex)
          emit('rowChange', currentIndex)
          // for same reason setCurrentRow and clearSelection are not working so
          // I had to add the current row class by hand
          setCurrentRow()
        }
      }
    }

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
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        sortMolecule(a, b, order === 'ascending' ? 1 : -1)))
    }

    const handleSortName = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))))
    }

    const handleSortId = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id))))
    }

    const handleSortN = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.n - b.n)))
    }

    const handleSortFdr = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.qValue - b.qValue)))
    }

    const handleSortChange = (settings: any, setCurrentRow: boolean = true) => {
      const { prop, order } = settings

      if (!order) {
        state.processedAnnotations = computed(() => props.data)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ID) {
        handleSortId(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_NAME) {
        handleSortName(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM) {
        handleSortFdr(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_N) {
        handleSortN(order)
      }

      $store.commit('setSortOrder', {
        by: prop,
        dir: order?.toUpperCase(),
      })

      emit('sortChange', !order ? null : state.processedAnnotations)

      if (setCurrentRow) {
        state.selectedRow = state.processedAnnotations[0]
        onPageChange(1)
      }
    }

    const onPageSizeChange = (newSize: number) => {
      state.pageSize = newSize

      emit('sizeChange', newSize)
    }

    const onPageChange = (newPage: number, fromUpDownArrow : boolean = false) => {
      const currentDataIndex = getDataItemIndex()

      // right
      if (!fromUpDownArrow && newPage > state.offset) {
        const newIndex = Math.min(currentDataIndex + (state.pageSize * (newPage - state.offset)),
          props.data.length - 1)
        state.selectedRow = state.processedAnnotations[newIndex]
      } else if (!fromUpDownArrow && newPage < state.offset) { // left
        const newIndex = Math.max(0, currentDataIndex - (state.pageSize * (state.offset - newPage)))
        state.selectedRow = state.processedAnnotations[newIndex]
      } else if (currentDataIndex === -1 && state.processedAnnotations.length > 0) { // keep row selected
        state.selectedRow = state.processedAnnotations[0]
      }

      newPage = newPage < 1 ? 1 : newPage
      state.offset = newPage

      $store.commit('setCurrentPage', newPage)
      emit('pageChange', newPage)

      handleCurrentRowChange(state.selectedRow)
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

    const formatFDR = (row: any) => {
      return row.qValue ? <span>{Math.round(row.qValue * 100)}%</span> : <span>&mdash;</span>
    }

    const getRowClass = (info: any) => {
      const { row } = info
      const { qValue: fdrLevel, colocalizationCoeff } = row
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

    const paginationLayout = () => {
      const { datasetIds } = props.filter || {}
      const limitedSpace = datasetIds && datasetIds.length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    }

    const startExport = async() => {
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

      function databaseId(compound : any) {
        return compound.information[0].databaseId
      }

      function formatRow(row : any) {
        const {
          dataset, sumFormula, adduct, chemMod, neutralLoss, ion, mz,
          msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos, possibleCompounds,
          isotopeImages, isomers, isobars,
          offSample, offSampleProb, colocalizationCoeff,
        } = row
        const cells = [
          dataset.groupApproved && dataset.group ? dataset.group.name : '',
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
          cells.push(colocalizedWith === ion ? 'Reference annotation' : colocalizationCoeff)
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
    }

    return () => {
      const totalCount = props.data.length
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
        <div class="dataset-enrichment-table">
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
            <TableColumn
              key="id"
              property="id"
              label="ID"
              sortable={'custom'}
              sortMethod={handleSortFormula}
              minWidth="100"
            />
            <TableColumn
              key="name"
              property="name"
              label="Name"
              sortable="custom"
              minWidth="140"
            />
            <TableColumn
              key="n"
              property="n"
              label="n"
              sortable="custom"
              minWidth="40"
            />
            <TableColumn
              key="qValue"
              property="qValue"
              label="FDR"
              className="fdr-cell"
              sortable="custom"
              minWidth="80"
              formatter={(row: any) => formatFDR(row)}
            />
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
            <Popover trigger="hover">
              <div slot="reference">
                {
                  state.isExporting
                && totalCount > 5000
                && <ProgressButton
                  class="export-btn"
                  width={130}
                  height={40}
                  percentage={state.exportProgress * 100}
                  onClick={abortExport}
                >
                  Cancel
                </ProgressButton>
                }
                {
                  !(state.isExporting
                  && totalCount > 5000)
                && <Button
                  class="export-btn"
                  disabled={state.isExporting}
                  onClick={startExport}
                >
                  Export to CSV
                </Button>
                }
              </div>

              Documentation for the CSV export is available{' '}
              <a
                href="https://github.com/metaspace2020/metaspace/wiki/CSV-annotations-export"
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                here<ExternalWindowSvg class="inline h-4 w-4 -mb-1 fill-current text-gray-800" />
              </a>
            </Popover>
          </div>
        </div>
      )
    }
  },
})
