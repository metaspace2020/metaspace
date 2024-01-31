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
import moment from 'moment'

interface DatasetEnrichmentTableProps {
  data: any[]
  isLoading: boolean
  filter: any
  filename: string
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
    filename: {
      type: String,
      default: 'enrichment.csv',
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
      const order = sort ? (sort.indexOf('-') === 0 ? 'descending' : 'ascending') : 'descending'
      const prop = sort ? sort.replace('-', '') : 'median'
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
      return {
        prop: 'median',
        order: 'descending',
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

    const handleSortName = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))))
    }

    const handleSortId = (order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id))))
    }

    const handleSortNumber = (prop: number, order: string) => {
      state.processedAnnotations = computed(() => props.data.slice().sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a[prop] - b[prop])))
    }

    const handleSortChange = (settings: any, setCurrentRow: boolean = true) => {
      const { prop, order } = settings

      if (!order) {
        state.processedAnnotations = computed(() => props.data)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ID) {
        handleSortId(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_NAME) {
        handleSortName(order)
      } else {
        handleSortNumber(prop, order)
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

    const formatFloat = (value: any) => {
      return value ? <span>{parseFloat(value).toFixed(4)}</span> : <span>&mdash;</span>
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
      const dateStr = moment().format('YYYY-MM-DD HH:mm:ss')
      let csv = `# Generated at ${dateStr}.\n`
        + `# URL: ${window.location.href}\n`

      const columns = ['ID', 'Name', 'n', 'Observed', 'Expected', 'Median', 'σ', 'p-value', 'q-value']

      csv += formatCsvRow(columns)

      function formatNumber(value: any) {
        return parseFloat(value).toFixed(4)
      }

      function formatRow(row : any) {
        const {
          id,
          median,
          expected,
          name,
          observed,
          pValue,
          qValue,
          std,
          n,
        } = row
        const cells = [
          id,
          name,
          n,
          formatNumber(observed),
          formatNumber(expected),
          formatNumber(median),
          formatNumber(std),
          formatNumber(pValue),
          formatNumber(qValue),
        ]

        return formatCsvRow(cells)
      }

      state.isExporting = true

      csv += props.data.map(formatRow).join('')

      if (state.isExporting) {
        state.isExporting = false
        state.exportProgress = 0

        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, props.filename)
      }
    }

    const abortExport = () => {
      state.isExporting = false
      state.exportProgress = 0
    }

    const renderExplainedHeader = (column : any, explanation: string) => {
      return <div class="explained-header">
        {column.label}
        <Popover
          trigger="hover"
          placement="right"
        >
          <i
            slot="reference"
            class="el-icon-question help-icon ml-0.5"
          />
          {explanation}
        </Popover>
      </div>
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
              minWidth="60"
              renderHeader={(h : any, { column } : any) => renderExplainedHeader(column,
                'Median number of molecules matched with term..')}
            />
            <TableColumn
              key="observed"
              property="observed"
              label="Observed"
              sortable="custom"
              minWidth="110"
              renderHeader={(h : any, { column } : any) => renderExplainedHeader(column,
                'Observed ratio over background in term.')}
              formatter={(row: any) => formatFloat(row.observed)}

            />
            <TableColumn
              key="expected"
              property="expected"
              label="Expected"
              sortable="custom"
              minWidth="110"
              renderHeader={(h : any, { column } : any) => renderExplainedHeader(column,
                'Expected ratio over background in term.')}
              formatter={(row: any) => formatFloat(row.expected)}

            />
            <TableColumn
              key="median"
              property="median"
              label="Median"
              sortable="custom"
              minWidth="100"
              renderHeader={(h : any, { column } : any) => renderExplainedHeader(column,
                'Fold enrichment median.')}
              formatter={(row: any) => formatFloat(row.median)}

            />
            <TableColumn
              key="std"
              property="std"
              label="σ"
              className="fdr-cell"
              sortable="custom"
              minWidth="80"
              renderHeader={(h : any, { column } : any) => renderExplainedHeader(column,
                'Standard deviation.')}
              formatter={(row: any) => formatFloat(row.std)}
            />
            <TableColumn
              key="p-value"
              property="pValue"
              label="p-value"
              sortable="custom"
              minWidth="80"
              formatter={(row: any) => formatFloat(row.pValue)}
            />
            <TableColumn
              key="qValue"
              property="qValue"
              label="q-value"
              sortable="custom"
              minWidth="80"
              formatter={(row: any) => formatFloat(row.qValue)}
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
            </div>
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
        </div>
      )
    }
  },
})
