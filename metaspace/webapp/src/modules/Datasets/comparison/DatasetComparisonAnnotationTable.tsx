import { defineComponent, onMounted, reactive, ref, watchEffect } from '@vue/composition-api'
import './DatasetComparisonAnnotationTable.scss'
import { Table, TableColumn, Pagination } from '../../../lib/element-ui'
import AnnotationTableMolName from '../../Annotations/AnnotationTableMolName.vue'
import { cloneDeep, findIndex } from 'lodash-es'
import Vue from 'vue'

interface DatasetComparisonAnnotationTableProps {
  annotations: any[]
  isLoading: boolean
  filter: any
}

interface DatasetComparisonAnnotationTableState {
  processedAnnotations: any[]
  selectedRow: any
  pageSize: number
  offset: number
}

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
  ORDER_BY_MSM: 'msmscore',
  ORDER_BY_FDR_MSM: 'fdrlevel',
  ORDER_BY_FORMULA: 'sumformula',
}

export const DatasetComparisonAnnotationTable = defineComponent<DatasetComparisonAnnotationTableProps>({
  name: 'DatasetComparisonAnnotationTable',
  props: {
    annotations: {
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
    const state = reactive<DatasetComparisonAnnotationTableState>({
      selectedRow: props.annotations[0],
      pageSize: 15,
      offset: 0,
      processedAnnotations: [],
    })

    watchEffect(() => {
      if (state.processedAnnotations.length !== props.annotations.length) {
        const { sort, row } = $route.query
        const annotations = cloneDeep(props.annotations)
        state.processedAnnotations = annotations
        const order = sort?.indexOf('-') === 0 ? 'descending' : 'ascending'
        const prop = sort ? sort.replace('-', '') : 'msmscore'
        handleSortChange({ order, prop })
        state.selectedRow = row ? cloneDeep(props.annotations)[parseInt(row, 10)]
          : state.processedAnnotations[0]
        handleCurrentRowChange(state.selectedRow)
      }
    })

    const clearCurrentRow = () => {
      const currentRow = document.querySelector('.current-row')
      if (currentRow) {
        currentRow.classList.remove('current-row')
      }
    }

    const setCurrentRow = () => {
      clearCurrentRow()
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      const currentIndex = findIndex(state.processedAnnotations.slice(dataStart, dataEnd),
        (annotation) => { return state.selectedRow.id === annotation.id })
      if (currentIndex !== -1) {
        setTimeout(() => {
          document.querySelectorAll('.el-table__row')[currentIndex].classList.add('current-row')
        }, 500)
      }
    }

    const getDefaultTableSort = () => {
      const { sort } = $route.query

      return {
        prop: sort ? sort.replace('-', '') : 'msmscore',
        order: sort?.indexOf('-') === 0 ? 'descending' : 'ascending',
      }
    }

    const handleKeyUp = (event: any) => {

    }

    const handleCurrentRowChange = (row: any) => {
      if (row) {
        state.selectedRow = row
        const currentIndex = findIndex(props.annotations,
          (annotation) => { return row.id === annotation.id })
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
      state.processedAnnotations = state.processedAnnotations.sort((a, b) =>
        sortMolecule(a, b, order === 'ascending' ? 1 : -1))
    }

    const handleSortMSM = (order: string) => {
      state.processedAnnotations = state.processedAnnotations.sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.msmScore - b.msmScore))
    }
    const handleSortFdr = (order: string) => {
      state.processedAnnotations = state.processedAnnotations.sort((a, b) =>
        (order === 'ascending' ? 1 : -1) * (a.fdrLevel - b.fdrLevel))
    }

    const handleSortChange = (settings: any) => {
      const { prop, order } = settings

      if (!order) {
        state.processedAnnotations = props.annotations
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FORMULA) {
        handleSortFormula(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_MSM) {
        handleSortMSM(order)
      } else if (prop === SORT_ORDER_TO_COLUMN.ORDER_BY_FDR_MSM) {
        handleSortFdr(order)
      }

      $store.commit('setSortOrder', {
        by: prop,
        dir: order?.toUpperCase(),
      })
    }

    const onPageSizeChange = (newSize: number) => {
      state.pageSize = newSize
    }

    const onPageChange = (newPage: number) => {
      state.offset = newPage
      handleCurrentRowChange(state.selectedRow)
    }

    const formatAnnotation = (row: any) => {
      return <AnnotationTableMolName annotation={row}/>
    }

    const formatMSM = (row: any) => {
      return row.msmScore.toFixed(3)
    }

    const formatFDR = (row: any) => {
      return row.fdrLevel ? <span>{Math.round(row.fdrLevel * 100)}%</span> : <span>&mdash</span>
    }

    const getRowClass = (info: any) => {
      const { row } = info
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

    const paginationLayout = () => {
      const { datasetIds } = props.filter || {}
      const limitedSpace = datasetIds && datasetIds.length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
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
        <div class="dataset-comparison-annotation-table">
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
                'key-up': handleKeyUp,
                'current-change': handleCurrentRowChange,
                'sort-change': handleSortChange,
              },
            }}
          >
            <TableColumn
              key="sumFormula"
              property="sumformula"
              label="Annotation"
              sortable={'custom'}
              sortMethod={handleSortFormula}
              minWidth="120"
              formatter={(row: any) => formatAnnotation(row)}
            />
            <TableColumn
              key="msmScore"
              property="msmscore"
              label="MSM"
              sortable="custom"
              minWidth="60"
              formatter={(row: any) => formatMSM(row)}
            />
            <TableColumn
              key="fdrLevel"
              property="fdrlevel"
              label="FDR"
              className="fdr-cell"
              sortable="custom"
              minWidth="40"
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
          </div>
        </div>
      )
    }
  },
})
