import { defineComponent, ref, computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElTable, ElTableColumn, ElPagination, ElEmpty, ElCheckbox, ElCheckboxGroup } from '../../../lib/element-plus'
import { experimentResultsQuery } from '../api'
import VolcanoPlot, { ResultRow } from '../charts/VolcanoPlot'
import IntensityStripPlot from '../charts/IntensityStripPlot'

interface ColumnDef {
  id: string
  prop: string
  label: string
  width?: string
  sortable?: boolean
  formatter?: (row: any) => string
}

const formatScientific = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? 'n/a' : (v as number).toExponential(3)

const formatPercent = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? 'n/a' : `${Math.round((v as number) * 100)}%`

const COLUMNS: ColumnDef[] = [
  { id: 'ion', prop: 'ion.ion', label: 'Ion', sortable: true },
  {
    id: 'lfc',
    prop: 'lfc',
    label: 'LFC',
    width: '100',
    sortable: true,
    formatter: (row) => (row.lfc == null ? 'n/a' : Number(row.lfc).toFixed(3)),
  },
  {
    id: 'pValue',
    prop: 'pValue',
    label: 'p-Value',
    width: '120',
    sortable: true,
    formatter: (row) => formatScientific(row.pValue),
  },
  {
    id: 'fdr',
    prop: 'fdr',
    label: 'FDR',
    width: '100',
    sortable: true,
    formatter: (row) => formatScientific(row.fdr),
  },
  {
    id: 'detA',
    prop: 'detectionRateA',
    label: 'det. A',
    width: '80',
    formatter: (row) => formatPercent(row.detectionRateA),
  },
  {
    id: 'detB',
    prop: 'detectionRateB',
    label: 'det. B',
    width: '80',
    formatter: (row) => formatPercent(row.detectionRateB),
  },
  { id: 'nA', prop: 'nA', label: 'n A', width: '60' },
  { id: 'nB', prop: 'nB', label: 'n B', width: '60' },
]

/**
 * Stage 3: tabular results view with a Volcano plot above the table and a
 * per-region IntensityStripPlot to the right of the table once a row is
 * selected. Adds a column-visibility picker above the table.
 */
export default defineComponent({
  name: 'ResultsStage',
  props: {
    experimentId: { type: String, required: true },
    filter: { type: Object as () => Record<string, unknown> | null, default: null },
  },
  emits: ['update:selectedRow'],
  setup(props, { emit }) {
    const orderBy = ref<string>('fdr ASC')
    const page = ref<number>(1)
    const pageSize = 25
    const offset = computed(() => (page.value - 1) * pageSize)

    const { result, loading } = useQuery(experimentResultsQuery, () => ({
      experimentId: props.experimentId,
      filter: props.filter,
      orderBy: orderBy.value,
      limit: pageSize,
      offset: offset.value,
    }))

    const rows = computed<ResultRow[]>(() => result.value?.experimentResults ?? [])

    const visibleCols = ref<string[]>(COLUMNS.map((c) => c.id))
    const selectedRow = ref<ResultRow | null>(null)

    const colMap: Record<string, string> = {
      ion: 'ion',
      lfc: 'lfc',
      pValue: 'p_value',
      fdr: 'fdr',
    }

    const onSort = ({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }): void => {
      if (!order) {
        orderBy.value = 'fdr ASC'
        return
      }
      const column = colMap[prop]
      if (!column) return
      orderBy.value = `${column} ${order === 'ascending' ? 'ASC' : 'DESC'}`
    }

    const onSelect = (row: ResultRow): void => {
      selectedRow.value = row
      emit('update:selectedRow', row)
    }

    const onVolcanoSelect = (ionId: number): void => {
      const match = rows.value.find((r) => r.ion.id === ionId) ?? null
      if (match) {
        selectedRow.value = match
        emit('update:selectedRow', match)
      }
    }

    return () => (
      <div data-test-key="results-stage">
        {loading.value && <p>Loading…</p>}
        {!loading.value && rows.value.length === 0 && <ElEmpty description="No results yet" />}
        {rows.value.length > 0 && (
          <>
            <div class="mb-4">
              <VolcanoPlot rows={rows.value} onSelect={onVolcanoSelect} />
            </div>

            <div class="mb-2 flex flex-wrap items-center gap-2" data-test-key="column-picker">
              <span class="text-xs text-gray-600">Columns:</span>
              <ElCheckboxGroup
                modelValue={visibleCols.value}
                onUpdate:modelValue={(v: string[]) => (visibleCols.value = v)}
              >
                {COLUMNS.map((c) => (
                  <ElCheckbox key={c.id} label={c.id}>
                    {c.label}
                  </ElCheckbox>
                ))}
              </ElCheckboxGroup>
            </div>

            <div class="flex flex-col lg:flex-row gap-4">
              <div class="flex-1 min-w-0">
                <ElTable
                  data={rows.value}
                  onSortChange={onSort}
                  onRowClick={onSelect}
                  stripe
                  data-test-key="results-table"
                >
                  {COLUMNS.filter((c) => visibleCols.value.includes(c.id)).map((c) => (
                    <ElTableColumn
                      key={c.id}
                      prop={c.prop}
                      label={c.label}
                      width={c.width}
                      sortable={c.sortable ? 'custom' : false}
                      formatter={c.formatter}
                    />
                  ))}
                </ElTable>
                <ElPagination
                  currentPage={page.value}
                  onUpdate:currentPage={(v: number) => (page.value = v)}
                  page-size={pageSize}
                  total={1000}
                  layout="prev, pager, next"
                />
              </div>
              <div class="lg:w-1/2 min-w-0" data-test-key="strip-plot-container">
                <IntensityStripPlot
                  experimentId={props.experimentId}
                  ionId={selectedRow.value?.ion.id ?? null}
                  fdr={selectedRow.value?.fdr ?? null}
                />
              </div>
            </div>
          </>
        )}
      </div>
    )
  },
})
