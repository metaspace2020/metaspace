import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import './SegmentationTable.scss'
import { ElTable, ElTableColumn, ElPagination, ElButton, ElPopover, ElIcon, ElTooltip } from '../../../lib/element-plus'
import ProgressButton from '../../Annotations/ProgressButton.vue'
import AnnotationTableMolName from '../../Annotations/AnnotationTableMolName.vue'
import { findIndex, orderBy } from 'lodash-es'
import * as FileSaver from 'file-saver'
import formatCsvRow, { formatCsvTextArray } from '../../../lib/formatCsvRow'
import { getLocalStorage, setLocalStorage } from '../../../lib/localStorage'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import { ArrowDown, Check, QuestionFilled, Loading } from '@element-plus/icons-vue'
import { uniqBy } from 'lodash-es'
import moment from 'moment'

interface SegmentationTableState {
  processedData: any
  selectedRow: any
  currentRowIndex: number
  pageSize: number
  offset: number
  keyListenerAdded: boolean
  isExporting: boolean
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
  ORDER_BY_ANNOTATION: 'annotation',
  ORDER_BY_SEGMENTS: 'segments',
  ORDER_BY_MAX_ENRICHMENT_SCORE: 'maxEnrichmentScore',
  ORDER_BY_MZ: 'mz',
  ORDER_BY_FDR: 'fdrLevel',
  ORDER_BY_MSM: 'msmScore',
  ORDER_BY_ADDUCT: 'adduct',
}

const SEGMENTATION_TABLE_COLUMNS = {
  annotation: {
    label: 'Annotation',
    src: 'annotation',
    selected: true,
  },
  segments: {
    label: 'Clusters',
    src: 'segments',
    selected: true,
  },
  maxEnrichmentScore: {
    label: 'Max Enrichment Score',
    src: 'maxEnrichmentScore',
    selected: true,
  },
  mz: {
    label: 'm/z',
    src: 'mz',
    selected: true,
  },
  adduct: {
    label: 'Adduct',
    src: 'adduct',
    selected: false,
  },
  fdrLevel: {
    label: 'FDR',
    src: 'fdrLevel',
    selected: false,
  },
  msmScore: {
    label: 'MSM',
    src: 'msmScore',
    selected: false,
  },
  molecules: {
    label: 'Molecules',
    src: 'molecules',
    selected: false,
  },
}

// Predefined colors for segments (matching SegmentationVisualization)
const SEGMENT_COLORS = [
  '#5B9BD5', // Blue - Segment 0
  '#70AD47', // Green - Segment 1
  '#A5A5A5', // Gray - Segment 2
  '#FFC000', // Yellow - Segment 3
  '#C55A5A', // Red - Segment 4
  '#9966CC', // Purple - Segment 5
  '#FF9900', // Orange - Segment 6
  '#00B4D8', // Cyan - Segment 7
  '#FF6B9D', // Pink - Segment 8
  '#8FBC8F', // Sea Green - Segment 9
]

const getSegmentColor = (segmentIndex: number): string => {
  return SEGMENT_COLORS[segmentIndex % SEGMENT_COLORS.length]
}

// Aggregate annotations by unique annotation ID
const aggregateAnnotations = (annotations: any[]): any[] => {
  const annotationMap = new Map()

  annotations.forEach((annotation) => {
    const key = annotation.id || `${annotation.sumFormula}-${annotation.adduct}-${annotation.mz}`

    if (annotationMap.has(key)) {
      const existing = annotationMap.get(key)
      // Add this segment to the existing annotation
      existing.segments.push({
        segmentIndex: annotation.segmentIndex,
        enrichmentScore: annotation.enrichmentScore,
        segmentationId: annotation.segmentationId,
      })
      // Update max enrichment score
      if (annotation.enrichmentScore > existing.maxEnrichmentScore) {
        existing.maxEnrichmentScore = annotation.enrichmentScore
      }
    } else {
      // Create new aggregated annotation
      annotationMap.set(key, {
        ...annotation,
        segments: [
          {
            segmentIndex: annotation.segmentIndex,
            enrichmentScore: annotation.enrichmentScore,
            segmentationId: annotation.segmentationId,
          },
        ],
        maxEnrichmentScore: annotation.enrichmentScore,
      })
    }
  })

  return Array.from(annotationMap.values())
}

export const SegmentationTable = defineComponent({
  name: 'SegmentationTable',
  props: {
    annotations: {
      type: Array,
      default: () => [],
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    currentAnnotation: {
      type: Object,
      default: null,
    },
  },
  emits: ['rowChange'],
  setup: function (props: any, { emit }) {
    const store = useStore()
    const route = useRoute()
    const table: any = ref(null)
    const pageSizes = [15, 20, 25, 30]
    const aggregatedAnnotations = computed(() => aggregateAnnotations(props.annotations))

    const state = reactive<SegmentationTableState>({
      selectedRow: aggregatedAnnotations.value[0],
      currentRowIndex: -1,
      pageSize: 15,
      offset: 0,
      processedData: computed(() => aggregatedAnnotations.value.slice()),
      keyListenerAdded: false,
      isExporting: false,
      exportProgress: 0,
      columns: SEGMENTATION_TABLE_COLUMNS,
    })

    const onKeyUp = (event: any) => {
      const shouldMoveFocus = document.activeElement?.closest('input,select,textarea') == null
      if (!shouldMoveFocus) {
        return
      }

      // @ts-ignore
      const action: string = KEY_TO_ACTION[event.key]

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
        state.selectedRow = state.processedData[currentDataIndex - 1]
        onPageChange(state.offset - 1, true)
        return
      }

      if (action === 'down' && currentRowIndex === state.pageSize - 1) {
        if (state.offset === getNumberOfPages()) {
          return
        }
        state.selectedRow = state.processedData[currentDataIndex + 1]
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
      newIdx = Math.min(newIdx, aggregatedAnnotations.value.length - 1)
      state.selectedRow = state.processedData[newIdx]
      handleCurrentRowChange(state.selectedRow)
    }

    const loadCustomCols = () => {
      const localColSettings: any = getLocalStorage('segmentationTableCols')
      const columns: any = state.columns
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
        window.addEventListener('keydown', onKeyDown)
      }
    })

    onUnmounted(() => {
      if (state.keyListenerAdded) {
        state.keyListenerAdded = false
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('keydown', onKeyDown)
      }
    })

    watch(
      () => props.isLoading,
      (newValue, oldValue) => {
        if (newValue === true && oldValue === false) {
          initializeTable()
        }
      }
    )

    watch(
      () => props.currentAnnotation,
      (newValue) => {
        if (newValue) {
          handleCurrentRowChange(newValue)
        }
      }
    )

    const sortAnnotation = (a: any, b: any, order: number) => {
      const re = /(\D+\d*)/i
      const reA = /[^a-zA-Z]/g
      const reN = /[^0-9]/g
      let aFormula = a.sumFormula || ''
      let bFormula = b.sumFormula || ''
      let aMatch = aFormula.match(re)
      let bMatch = bFormula.match(re)

      if (!aMatch || !bMatch) {
        return aFormula.localeCompare(bFormula) * order
      }

      let aMolecule = aMatch[1]
      let bMolecule = bMatch[1]

      while (aFormula && bFormula && aMolecule === bMolecule) {
        aFormula = aFormula.substring(aMatch.length + 1, aFormula.length)
        bFormula = bFormula.substring(bMatch.length + 1, bFormula.length)
        aMatch = aFormula.match(re)
        bMatch = bFormula.match(re)

        if (!bMatch) {
          return -order
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
        return aN === bN ? 0 : aN > bN ? order : -order
      } else {
        return aA > bA ? order : -order
      }
    }

    const handleSortAnnotation = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value.slice().sort((a, b) => sortAnnotation(a, b, order === 'ascending' ? 1 : -1))
      )
    }

    const handleSortSegments = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value
          .slice()
          .sort((a, b) => (order === 'ascending' ? 1 : -1) * (a.segments.length - b.segments.length))
      )
    }

    const handleSortMaxEnrichmentScore = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value
          .slice()
          .sort((a, b) => (order === 'ascending' ? 1 : -1) * (a.maxEnrichmentScore - b.maxEnrichmentScore))
      )
    }

    const handleSortMZ = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value
          .slice()
          .sort((a, b) => (order === 'ascending' ? 1 : -1) * ((a.mz || 0) - (b.mz || 0)))
      )
    }

    const handleSortFDR = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value
          .slice()
          .sort((a, b) => (order === 'ascending' ? 1 : -1) * ((a.fdrLevel || 0) - (b.fdrLevel || 0)))
      )
    }

    const handleSortMSM = (order: string) => {
      state.processedData = computed(() =>
        aggregatedAnnotations.value
          .slice()
          .sort((a, b) => (order === 'ascending' ? 1 : -1) * ((a.msmScore || 0) - (b.msmScore || 0)))
      )
    }

    const handleSortAdduct = (order: string) => {
      state.processedData = computed(() =>
        orderBy(
          aggregatedAnnotations.value,
          [(item: any) => (item.adduct || '').toLowerCase().replace('+', '').replace('-', '')],
          [order === 'ascending' ? 'asc' : 'desc']
        )
      )
    }

    const handleSortChange = (settings: any, setCurrentRow: boolean = true) => {
      const { prop, order } = settings
      if (!order) {
        state.processedData = computed(() => aggregatedAnnotations.value)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ANNOTATION) {
        handleSortAnnotation(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_SEGMENTS) {
        handleSortSegments(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MAX_ENRICHMENT_SCORE) {
        handleSortMaxEnrichmentScore(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MZ) {
        handleSortMZ(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FDR) {
        handleSortFDR(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MSM) {
        handleSortMSM(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_ADDUCT) {
        handleSortAdduct(order)
      }

      store.commit('setSortOrder', {
        by: prop,
        dir: order?.toUpperCase(),
      })

      if (setCurrentRow) {
        state.selectedRow = state.processedData[0]
        onPageChange(1)
      }
    }

    const initializeTable = () => {
      const { sort, row, page }: any = route.query
      const order = sort?.indexOf('-') === 0 ? 'descending' : 'ascending'
      const prop = sort ? sort.replace('-', '') : SORT_ORDER_TO_COLUMN.ORDER_BY_MAX_ENRICHMENT_SCORE
      handleSortChange({ order, prop }, false)

      state.selectedRow = row ? aggregatedAnnotations.value[parseInt(row, 10)] : state.processedData[0]
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
      const dataStart = (state.offset - 1) * state.pageSize
      const dataEnd = (state.offset - 1) * state.pageSize + state.pageSize
      return findIndex(state.processedData.slice(dataStart, dataEnd), (item: any) => {
        return state.selectedRow?.id === item?.id
      })
    }

    const getDataItemIndex = () => {
      return findIndex(state.processedData, (item: any) => {
        return state.selectedRow?.id === item?.id
      })
    }

    const getNumberOfPages = () => {
      return Math.ceil(aggregatedAnnotations.value.length / state.pageSize)
    }

    const setCurrentRow = () => {
      clearCurrentRow()
      const currentIndex = getCurrentRowIndex()
      if (state.currentRowIndex !== currentIndex && state.currentRowIndex !== -1) {
        setTimeout(() => {
          if (
            document &&
            document.querySelectorAll('.el-table__row') &&
            document.querySelectorAll('.el-table__row').length > state.currentRowIndex &&
            document.querySelectorAll('.el-table__row')[state.currentRowIndex]
          ) {
            document.querySelectorAll('.el-table__row')[state.currentRowIndex].classList.remove('current-row')
          }
          state.currentRowIndex = currentIndex
        }, 100)
      }

      if (currentIndex !== -1) {
        setTimeout(() => {
          if (
            document.querySelectorAll('.el-table__row') &&
            document.querySelectorAll('.el-table__row').length > currentIndex &&
            document.querySelectorAll('.el-table__row')[currentIndex]
          ) {
            document.querySelectorAll('.el-table__row')[currentIndex].classList.add('current-row')
          }
        }, 100)
      }
    }

    const getDefaultTableSort = () => {
      const { sort }: any = route.query

      return {
        prop: sort ? sort.replace('-', '') : SORT_ORDER_TO_COLUMN.ORDER_BY_MAX_ENRICHMENT_SCORE,
        order: sort?.indexOf('-') === 0 ? 'descending' : 'ascending',
      }
    }

    const onKeyDown = (event) => {
      const action = KEY_TO_ACTION[event.key]
      if (action) {
        event.preventDefault()
        return false
      }
      return true
    }

    const handleSelectCol = (src: string) => {
      if (state.columns[src]) {
        state.columns[src].selected = !state.columns[src].selected
        setLocalStorage('segmentationTableCols', state.columns)
      }
    }

    const handleCurrentRowChange = (row: any) => {
      if (row) {
        state.selectedRow = row
        const currentIndex = findIndex(state.processedData.slice(0), (item: any) => {
          return row.id === item.id
        })

        if (state.currentRowIndex === -1) {
          state.currentRowIndex = currentIndex
        }
        const rowPage = Math.floor(currentIndex / state.pageSize) + 1
        if (rowPage !== state.offset) {
          state.offset = rowPage
          onPageChange(rowPage, false)
        }

        if (currentIndex !== -1) {
          store.commit('setRow', currentIndex)
          emit('rowChange', currentIndex, row)
          setCurrentRow()
        }
      }
    }

    const onPageSizeChange = (newSize: number) => {
      state.pageSize = newSize
    }

    const onPageChange = (newPage: number, fromUpDownArrow: boolean = false) => {
      const currentDataIndex = getDataItemIndex()

      if (!fromUpDownArrow && newPage > state.offset) {
        const newIndex = Math.min(
          currentDataIndex + state.pageSize * (newPage - state.offset),
          aggregatedAnnotations.value.length - 1
        )
        state.selectedRow = state.processedData[newIndex]
      } else if (!fromUpDownArrow && newPage < state.offset) {
        const newIndex = Math.max(0, currentDataIndex - state.pageSize * (state.offset - newPage))
        state.selectedRow = state.processedData[newIndex]
      } else if (currentDataIndex === -1 && state.processedData.length > 0) {
        state.selectedRow = state.processedData[0]
      }

      newPage = newPage < 1 ? 1 : newPage
      newPage = (newPage - 1) * state.pageSize >= state.processedData.length ? 1 : newPage
      state.offset = newPage

      store.commit('setCurrentPage', newPage)
      handleCurrentRowChange(state.selectedRow)
    }

    const isColSelected = (src: string) => {
      return state.columns[src]?.selected
    }

    const renderMaxEnrichmentScoreHeader = () => {
      return (
        <div class="enrichment-score-header">
          Max Enrichment Score
          <ElPopover
            trigger="hover"
            placement="right"
            v-slots={{
              reference: () => (
                <ElIcon class="metadata-help-icon ml-1">
                  <QuestionFilled />
                </ElIcon>
              ),
              default: () => <span>Highest enrichment score for this annotation across all segments</span>,
            }}
          />
        </div>
      )
    }

    const formatAnnotation = (row: any) => {
      return <AnnotationTableMolName annotation={row} hideFilter />
    }

    const formatSegments = (row: any) => {
      if (!row.segments || row.segments.length === 0) return '—'
      return (
        <div class="segments-container">
          {uniqBy(row.segments, 'segmentIndex').map((segment: any, index: number) => (
            <ElTooltip
              key={`${segment.segmentIndex}-${index}`}
              content={`Cluster ${segment.segmentIndex + 1} (Score: ${segment.enrichmentScore?.toFixed(3) || 'N/A'})`}
              placement="top"
            >
              <div
                class="segment-square"
                style={{
                  backgroundColor: getSegmentColor(segment.segmentIndex),
                }}
              />
            </ElTooltip>
          ))}
        </div>
      )
    }

    const formatMaxEnrichmentScore = (row: any) => {
      return row.maxEnrichmentScore?.toFixed(3) || '—'
    }

    const formatMZ = (row: any) => {
      return row.mz?.toFixed(4) || '—'
    }

    const formatFDR = (row: any) => {
      return row.fdrLevel ? <span>{Math.round(row.fdrLevel * 100)}%</span> : <span>&mdash;</span>
    }

    const formatMSM = (row: any) => {
      return row.msmScore?.toFixed(3) || '—'
    }

    const formatAdduct = (row: any) => {
      return row.adduct || '—'
    }

    const formatMolecules = (row: any) => {
      return row.possibleCompounds?.map((molecule: any) => molecule.name).join(', ') || '—'
    }

    const getRowClass = (info: any) => {
      const { row } = info
      const fdrLevel = row?.fdrLevel
      const fdrClass =
        fdrLevel == null
          ? 'fdr-null'
          : fdrLevel <= 0.051
          ? 'fdr-5'
          : fdrLevel <= 0.101
          ? 'fdr-10'
          : fdrLevel <= 0.201
          ? 'fdr-20'
          : 'fdr-50'

      return fdrClass
    }

    const startExport = async () => {
      const dateStr = moment().format('YYYY-MM-DD HH:mm:ss')
      let csv = `# Generated at ${dateStr}.\n` + `# URL: ${window.location.href}\n`

      const columns = ['Annotation', 'Segments', 'Max Enrichment Score', 'm/z', 'Adduct', 'FDR', 'MSM', 'Molecules']

      csv += formatCsvRow(columns)

      function formatRow(row: any) {
        const segmentNames = row.segments?.map((s: any) => `Cluster ${s.segmentIndex + 1}`).join(', ') || ''
        const cells = [
          row?.sumFormula || '',
          segmentNames,
          row?.maxEnrichmentScore || '',
          row?.mz || '',
          row?.adduct || '',
          row?.fdrLevel || '',
          row?.msmScore || '',
          formatCsvTextArray(row?.possibleCompounds?.map((m: any) => m.name) || []),
        ]

        return formatCsvRow(cells)
      }

      state.isExporting = true

      csv += aggregatedAnnotations.value.map(formatRow).join('')

      if (state.isExporting) {
        state.isExporting = false
        state.exportProgress = 0

        const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
        FileSaver.saveAs(blob, 'segmentation_annotations.csv')
      }
    }

    const abortExport = () => {
      state.isExporting = false
      state.exportProgress = 0
    }

    return () => {
      const totalCount = aggregatedAnnotations.value.length
      const dataStart = (state.offset - 1) * state.pageSize
      const dataEnd = (state.offset - 1) * state.pageSize + state.pageSize
      if (props.isLoading) {
        return (
          <div class="segmentation-table-loading-wrapper flex flex-col justify-center items-center h-full">
            Loading annotations...
            <ElIcon class="is-loading">
              <Loading />
            </ElIcon>
          </div>
        )
      }

      return (
        <div class="segmentation-table relative">
          <ElTable
            id="segmentation-table"
            ref={table}
            data={state.processedData.slice(dataStart, dataEnd)}
            rowClassName={getRowClass}
            size="small"
            emptyText={
              'No segmentation annotations found. Please check if segmentation analysis has been completed ' +
              'for this dataset.'
            }
            border
            elementLoadingText="Loading annotations …"
            highlightCurrentRow
            width="100%"
            stripe
            tabindex="1"
            onKeyDown={onKeyDown}
            onKeyUp={onKeyDown}
            defaultSort={getDefaultTableSort()}
            onCurrentChange={handleCurrentRowChange}
            onSortChange={handleSortChange}
          >
            {isColSelected('annotation') && (
              <ElTableColumn
                key="annotation"
                property="annotation"
                label={state.columns.annotation?.label}
                sortable={'custom'}
                minWidth="120"
                formatter={(row: any) => formatAnnotation(row)}
              />
            )}
            {isColSelected('segments') && (
              <ElTableColumn
                key="segments"
                property="segments"
                label={state.columns.segments?.label}
                sortable={'custom'}
                minWidth="120"
                formatter={(row: any) => formatSegments(row)}
              />
            )}
            {isColSelected('maxEnrichmentScore') && (
              <ElTableColumn
                key="maxEnrichmentScore"
                property="maxEnrichmentScore"
                label={state.columns.maxEnrichmentScore?.label}
                sortable="custom"
                minWidth="160"
                v-slots={{
                  header: renderMaxEnrichmentScoreHeader,
                }}
                formatter={(row: any) => formatMaxEnrichmentScore(row)}
              />
            )}
            {isColSelected('mz') && (
              <ElTableColumn
                key="mz"
                property="mz"
                label={state.columns.mz?.label}
                sortable="custom"
                minWidth="80"
                formatter={(row: any) => formatMZ(row)}
              />
            )}
            {isColSelected('adduct') && (
              <ElTableColumn
                key="adduct"
                property="adduct"
                label={state.columns.adduct?.label}
                sortable={'custom'}
                minWidth="80"
                formatter={(row: any) => formatAdduct(row)}
              />
            )}
            {isColSelected('fdrLevel') && (
              <ElTableColumn
                key="fdrLevel"
                property="fdrLevel"
                label={state.columns.fdrLevel?.label}
                class="fdr-cell"
                sortable="custom"
                minWidth="80"
                formatter={(row: any) => formatFDR(row)}
              />
            )}
            {isColSelected('msmScore') && (
              <ElTableColumn
                key="msmScore"
                property="msmScore"
                label={state.columns.msmScore?.label}
                sortable="custom"
                minWidth="80"
                formatter={(row: any) => formatMSM(row)}
              />
            )}
            {isColSelected('molecules') && (
              <ElTableColumn
                key="molecules"
                property="molecules"
                label={state.columns.molecules?.label}
                sortable="false"
                minWidth="120"
                showOverflowTooltip
                formatter={(row: any) => formatMolecules(row)}
              />
            )}
          </ElTable>
          <div class="flex justify-between items-start mt-2">
            <div>
              <ElPagination
                class="mt-1"
                total={totalCount}
                pageSize={state.pageSize}
                pageSizes={pageSizes}
                currentPage={state.offset}
                onSizeChange={onPageSizeChange}
                onCurrentChange={onPageChange}
                layout="prev,pager,next,sizes"
              />
              <div id="segmentation-count" class="mt-2">
                <b>{totalCount}</b> matching {totalCount === 1 ? 'record' : 'records'}
              </div>
              <div class="mt-2">
                <div class="fdr-legend-header">FDR levels:</div>
                <div class="fdr-legend fdr-5">5%</div>
                <div class="fdr-legend fdr-10">10%</div>
                <div class="fdr-legend fdr-20">20%</div>
                <div class="fdr-legend fdr-50">50%</div>
              </div>
            </div>

            <div class="flex w-full items-center justify-end flex-wrap">
              <ElPopover
                class="mt-1"
                width="200"
                v-slots={{
                  reference: () => (
                    <ElButton class="select-btn-wrapper relative">
                      Columns
                      <ElIcon class="el-icon-arrow-down select-btn-icon">
                        <ArrowDown />
                      </ElIcon>
                    </ElButton>
                  ),
                  default: () => (
                    <div>
                      <div class="cursor-pointer select-none">
                        {Object.values(state.columns).map((column: any) => {
                          return (
                            <div
                              onClick={() => {
                                handleSelectCol(column.src)
                              }}
                            >
                              {column.selected && (
                                <ElIcon>
                                  <Check />
                                </ElIcon>
                              )}
                              {!column.selected && (
                                <ElIcon class="invisible">
                                  <Check />
                                </ElIcon>
                              )}
                              <span>{column.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ),
                }}
              ></ElPopover>
              {state.isExporting && (
                <div class="select-btn-wrapper ml-2 mt-1">
                  <ProgressButton
                    class="export-btn"
                    width={146}
                    height={42}
                    percentage={state.exportProgress * 100} // @ts-ignore
                    onClick={abortExport}
                  >
                    Cancel
                  </ProgressButton>
                </div>
              )}
              {!state.isExporting && (
                <div class="ml-2 mt-1">
                  <ElButton class="select-btn-wrapper relative" width={146} height={42} onClick={startExport}>
                    Export to CSV
                  </ElButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
  },
})
