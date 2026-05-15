import { defineComponent, ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import {
  ElTable,
  ElTableColumn,
  ElPagination,
  ElEmpty,
  ElButton,
  ElPopover,
  ElIcon,
  ElCollapse,
  ElCollapseItem,
  ElSelect,
  ElOption,
} from '../../../lib/element-plus'
import { ArrowDown, Check, Download } from '@element-plus/icons-vue'
import * as FileSaver from 'file-saver'
import formatCsvRow from '../../../lib/formatCsvRow'
import MolecularFormula from '../../../components/MolecularFormula'
import CopyButton from '../../../components/CopyButton.vue'
import { calculateMzFromFormula } from '../../../lib/formulaParser'
import { experimentResultsQuery } from '../api'
import VolcanoPlot, { ResultRow } from '../charts/VolcanoPlot'
import IntensityStripPlot from '../charts/IntensityStripPlot'
import './ResultsStage.scss'

interface ColumnDef {
  id: string
  prop: string
  label: string
  width?: string
  className?: string
  sortable?: boolean
  formatter?: (row: any) => any
}

/** Snap a raw FDR value (0..1) to the nearest standard threshold for display,
 *  matching the convention used elsewhere in the app (Annotations view etc). */
const formatFdrPercent = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return '—'
  const pct = (v as number) * 100
  for (const level of [5, 10, 20, 50]) {
    if (pct <= level + 0.1) return `${level}%`
  }
  return '> 50%'
}

const formatPercent = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? '—' : `${Math.round((v as number) * 100)}%`

const formatScientific = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return '—'
  const n = v as number
  if (n === 0) return '0'
  if (Math.abs(n) >= 0.001 && Math.abs(n) < 1000) return n.toFixed(3)
  return n.toExponential(2)
}

// Column `prop` is a simple identifier (no dotted paths) — ElTable's
// sortChange events emit it verbatim and dotted props confuse the internal
// sort plumbing even with sortable='custom'. The cell renderer for the
// Annotation column uses the row directly, so its `prop` value is just a
// stable sort key.
//
// The experiment resolver only supports sorting by `pValue`, `lfc`, and
// `fdr` (see graphql/src/modules/experiment/controller/Query.ts), and only
// in ascending order — direction is ignored server-side. The other columns
// are marked non-sortable to avoid showing arrows that don't do anything.
const COLUMNS: ColumnDef[] = [
  { id: 'ion', prop: 'ion', label: 'Annotation', sortable: false },
  {
    id: 'condA',
    prop: 'condA',
    label: 'A',
    width: '110',
    formatter: (row) => row.condA ?? '—',
  },
  {
    id: 'condB',
    prop: 'condB',
    label: 'B',
    width: '110',
    formatter: (row) => row.condB ?? '—',
  },
  {
    id: 'lfc',
    prop: 'lfc',
    label: 'LFC',
    width: '90',
    sortable: true,
    formatter: (row) => (row.lfc == null ? '—' : Number(row.lfc).toFixed(2)),
  },
  {
    id: 'pValue',
    prop: 'pValue',
    label: 'p-Value',
    width: '110',
    sortable: true,
    formatter: (row) => formatScientific(row.pValue),
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
  {
    id: 'nA',
    prop: 'nA',
    label: 'n A',
    width: '60',
    formatter: (row) => (row.nA == null ? '—' : String(row.nA)),
  },
  {
    id: 'nB',
    prop: 'nB',
    label: 'n B',
    width: '60',
    formatter: (row) => (row.nB == null ? '—' : String(row.nB)),
  },
  // FDR is the last column (per mockup) so the colored cell sits at the
  // right edge of the table.
  {
    id: 'fdr',
    prop: 'fdr',
    label: 'FDR',
    width: '80',
    className: 'fdr-cell',
    sortable: true,
    formatter: (row) => formatFdrPercent(row.fdr),
  },
]

const fdrClass = (fdr: number | null | undefined): string => {
  if (fdr == null) return 'fdr-null'
  if (fdr <= 0.051) return 'fdr-5'
  if (fdr <= 0.101) return 'fdr-10'
  if (fdr <= 0.201) return 'fdr-20'
  return 'fdr-50'
}

/**
 * Stage 3: differential-analysis results.
 *
 * Two-column layout following the project's diff-analysis pattern:
 * - Left: paginated results table, with FDR-coloured cells, column picker
 *   and CSV export in the footer.
 * - Right: selected-annotation header + collapsible Statistical analysis
 *   panels (per-region intensity strip, volcano plot).
 *
 * The table is paginated server-side, but the volcano plot fetches all rows
 * separately so it can show the whole population at once.
 */
export default defineComponent({
  name: 'ResultsStage',
  props: {
    experimentId: { type: String, required: true },
    filter: { type: Object as () => Record<string, unknown> | null, default: null },
  },
  emits: ['update:selectedRow'],
  setup(props, { emit }) {
    // Sort state shared between the table (display) and the page query.
    // `orderBy` is what we send to the resolver. The resolver was extended to
    // accept "<col> ASC" / "<col> DESC" — see the experimentResults Query
    // resolver. Direction round-trips so clicking the same column's arrow
    // actually changes the data.
    const tableSort = ref<{ prop: string; order: 'ascending' | 'descending' }>({
      prop: 'fdr',
      order: 'ascending',
    })
    const SORTABLE_PROPS = new Set(['lfc', 'pValue', 'fdr'])
    const orderBy = computed(() => {
      const prop = SORTABLE_PROPS.has(tableSort.value.prop) ? tableSort.value.prop : 'fdr'
      const dir = tableSort.value.order === 'descending' ? 'DESC' : 'ASC'
      return `${prop} ${dir}`
    })
    // Snapshot the initial sort for ElTable.defaultSort. We do NOT bind this
    // reactively — passing the live ref makes ElTable reset its internal
    // sort state on every change, which breaks subsequent header clicks.
    const initialSort = { prop: tableSort.value.prop, order: tableSort.value.order }

    const page = ref<number>(1)
    const pageSize = ref<number>(15)
    const offset = computed(() => (page.value - 1) * pageSize.value)

    // Contrast filter:
    //   null               -> default (pair rows, resolver applies cond_a IS NOT NULL)
    //   { omnibus: true }  -> omnibus rows
    //   { condA, condB }   -> specific pair
    const contrast = ref<{ omnibus: true } | { condA: string; condB: string } | null>(null)

    const { result, loading } = useQuery(experimentResultsQuery, () => ({
      experimentId: props.experimentId,
      filter: {
        ...(props.filter ?? {}),
        ...(contrast.value ? { contrast: contrast.value } : {}),
      },
      orderBy: orderBy.value,
      limit: pageSize.value,
      offset: offset.value,
    }))

    // Available conditions — discovered from fetched rows.
    const availableConditions = computed<string[]>(() => {
      const rows = ((result.value as any)?.experimentResults ?? []) as Array<{
        condA?: string | null
        condB?: string | null
      }>
      const set = new Set<string>()
      for (const r of rows) {
        if (r.condA) set.add(r.condA)
        if (r.condB) set.add(r.condB)
      }
      return Array.from(set).sort()
    })
    const showContrastSelector = computed(() => availableConditions.value.length >= 3)

    // Live rows from Apollo for the *current* query. May briefly resolve to
    // `[]` while a new page is fetching, depending on cache state.
    const liveRows = computed<any[]>(() => (result.value as any)?.experimentResults ?? [])
    // `rows` is the cached snapshot we feed the table — only updated when a
    // non-empty response arrives, so the table never blanks out during a
    // page/sort change. The brief loading state is conveyed by `v-loading`
    // on the wrapper instead of by an empty data array.
    const rows = ref<any[]>([])
    watch(
      liveRows,
      (v) => {
        if (v.length > 0 || !loading.value) rows.value = v
      },
      { immediate: true }
    )

    // Separate, unbounded query for the volcano plot so it always shows the
    // full population — independent of the table's pagination + sort.
    const VOLCANO_LIMIT = 10000
    const { result: volcanoResult }: any = useQuery(experimentResultsQuery, () => ({
      experimentId: props.experimentId,
      filter: {
        ...(props.filter ?? {}),
        ...(contrast.value ? { contrast: contrast.value } : {}),
      },
      // Mirror the table's sort so `volcanoRows.findIndex(...)` yields the
      // row's absolute position under the current ordering — needed to jump
      // the table to the correct page when a volcano dot is clicked.
      orderBy: orderBy.value,
      limit: VOLCANO_LIMIT,
      offset: 0,
    }))
    const volcanoRows = computed<ResultRow[]>(() => volcanoResult.value?.experimentResults ?? [])

    const visibleCols = ref<string[]>(COLUMNS.filter((c) => c.id !== 'nA' && c.id !== 'nB').map((c) => c.id))
    const selectedRow = ref<any | null>(null)
    const tableRef = ref<any>(null)

    const ensureSelection = (): void => {
      if (selectedRow.value == null && rows.value.length > 0) {
        selectedRow.value = rows.value[0]
        emit('update:selectedRow', rows.value[0])
      }
    }

    // Keyboard navigation, mirroring the convention used by the diff-analysis
    // and dataset-comparison tables: up/down moves the selection within the
    // current page (wrapping to the previous/next page at the edges), and
    // left/right paginates. Listeners are window-level but gated on focus
    // not being in a text input so they don't fight with form controls.
    const KEY_TO_ACTION: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }
    const totalPages = computed(() =>
      Math.max(1, Math.ceil((volcanoRows.value.length || rows.value.length) / pageSize.value))
    )
    const currentPageIndex = computed(() => {
      const id = selectedRow.value?.ion?.id
      if (id == null) return -1
      return rows.value.findIndex((r) => r.ion?.id === id)
    })
    // After a page change the new page's rows arrive asynchronously — when
    // a navigation action requires "select first/last of the next page" we
    // stash the target index and apply it once the new rows are in.
    const pendingSelectIndex = ref<number | null>(null)
    // Set when a volcano click triggers a page change — the new page's row
    // matching this ion id is selected once it arrives.
    const pendingSelectIonId = ref<number | null>(null)
    watch(rows, (newRows) => {
      if (newRows.length === 0) return
      if (pendingSelectIonId.value != null) {
        const match = newRows.find((r) => r.ion?.id === pendingSelectIonId.value)
        if (match) onSelect(match)
        pendingSelectIonId.value = null
        return
      }
      if (pendingSelectIndex.value == null) return
      const i = pendingSelectIndex.value
      const idx = i < 0 ? newRows.length - 1 : Math.min(i, newRows.length - 1)
      onSelect(newRows[idx])
      pendingSelectIndex.value = null
    })

    const onKeyDown = (e: KeyboardEvent): void => {
      // Prevent default scroll on arrow keys when the table is the focus.
      if (KEY_TO_ACTION[e.key] && document.activeElement?.closest('input,select,textarea') == null) {
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      const action = KEY_TO_ACTION[e.key]
      if (!action) return
      if (document.activeElement?.closest('input,select,textarea') != null) return
      e.preventDefault()
      e.stopPropagation()

      const pageRows = rows.value
      const idx = currentPageIndex.value
      const lastIdx = pageRows.length - 1
      const curPage = page.value
      const lastPage = totalPages.value

      if (action === 'left') {
        if (curPage > 1) {
          pendingSelectIndex.value = idx === -1 ? 0 : idx
          page.value = curPage - 1
        }
        return
      }
      if (action === 'right') {
        if (curPage < lastPage) {
          pendingSelectIndex.value = idx === -1 ? 0 : idx
          page.value = curPage + 1
        }
        return
      }
      if (action === 'up') {
        if (idx > 0) {
          onSelect(pageRows[idx - 1])
        } else if (curPage > 1) {
          // Wrap to the previous page's last row.
          pendingSelectIndex.value = -1
          page.value = curPage - 1
        }
        return
      }
      if (action === 'down') {
        if (idx !== -1 && idx < lastIdx) {
          onSelect(pageRows[idx + 1])
        } else if (curPage < lastPage) {
          pendingSelectIndex.value = 0
          page.value = curPage + 1
        }
      }
    }
    onMounted(() => {
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('keydown', onKeyDown)
    })
    onUnmounted(() => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    })

    const onSort = ({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }): void => {
      // ElTable emits null when sorting is removed; fall back to default sort.
      if (!order) {
        tableSort.value = { prop: 'fdr', order: 'ascending' }
        return
      }
      tableSort.value = { prop, order }
    }

    const onSelect = (row: any): void => {
      if (row == null) return
      selectedRow.value = row
      emit('update:selectedRow', row)
    }

    const onVolcanoSelect = (ionId: number): void => {
      // Find the row in the volcano dataset (which mirrors the table's
      // current sort) and navigate the table to the page containing it so
      // the user can see where it sits in the ranking.
      const absoluteIdx = volcanoRows.value.findIndex((r) => r.ion?.id === ionId)
      if (absoluteIdx === -1) {
        // Fallback — pick from current page if the volcano query hasn't
        // resolved yet, so the right column at least updates.
        const cur = rows.value.find((r) => r.ion?.id === ionId)
        if (cur) onSelect(cur)
        return
      }
      const targetPage = Math.floor(absoluteIdx / pageSize.value) + 1
      if (targetPage !== page.value) {
        // Defer row selection until the new page's rows arrive — the watch
        // on `rows` re-applies the selection by ion id.
        pendingSelectIonId.value = ionId
        page.value = targetPage
      } else {
        const cur = rows.value.find((r) => r.ion?.id === ionId) ?? volcanoRows.value[absoluteIdx]
        onSelect(cur)
      }
    }

    const rowClassName = (info: any): string => {
      const fdr = info.row?.fdr
      const isCurrent = selectedRow.value && info.row?.ion?.id === selectedRow.value.ion?.id
      return `${fdrClass(fdr)}${isCurrent ? ' current-row' : ''}`
    }

    const toggleCol = (id: string): void => {
      if (visibleCols.value.includes(id)) {
        visibleCols.value = visibleCols.value.filter((c) => c !== id)
      } else {
        visibleCols.value = [...visibleCols.value, id]
      }
    }

    const exportCsv = (): void => {
      const cols = COLUMNS.filter((c) => visibleCols.value.includes(c.id))
      const header = cols.map((c) => c.label)
      let csv = formatCsvRow(header)
      for (const r of rows.value) {
        const cells = cols.map((c) => {
          if (c.id === 'ion') return r.ion?.ion ?? ''
          if (c.formatter) {
            const v = c.formatter(r)
            return typeof v === 'string' ? v : String(v ?? '')
          }
          return c.prop.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), r) ?? ''
        })
        csv += formatCsvRow(cells)
      }
      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, 'experiment_results.csv')
    }

    const renderAnnotationCell = (row: any) => {
      if (!row?.ion?.ion) return <span>—</span>
      return (
        <div class="cell-wrapper">
          <span class="cell-span">
            <MolecularFormula ion={row.ion.ion} />
          </span>
        </div>
      )
    }

    const renderSelectedHeader = () => {
      const r = selectedRow.value
      if (r == null) {
        return (
          <div class="selected-annotation-header">
            <div class="sa-title text-gray-400">No annotation selected</div>
            <div class="sa-hint">Click a row in the table to inspect statistics.</div>
          </div>
        )
      }
      const lfc = typeof r.lfc === 'number' ? r.lfc : null
      const lfcStr = lfc == null ? '—' : `${lfc > 0 ? '+' : ''}${lfc.toFixed(2)}`
      // `Ion.mz` is not in the schema, so compute it client-side from the
      // ion string + charge polarity using the same helper the rest of the
      // app uses. This avoids a server roundtrip and matches the numbers the
      // engine produces.
      let mz: number | null = null
      try {
        if (r.ion?.ion) {
          const polarity = (r.ion?.charge ?? 1) >= 0 ? 'POSITIVE' : 'NEGATIVE'
          const v = calculateMzFromFormula(r.ion.ion, polarity)
          if (Number.isFinite(v) && v > 0) mz = v
        }
      } catch {
        /* ignore — header just won't show m/z */
      }
      const mzStr = mz == null ? null : mz.toFixed(4)
      const pStr = formatScientific(r.pValue)
      const fdrStr = formatFdrPercent(r.fdr)
      const significant = r.fdr != null && Number(r.fdr) <= 0.05
      return (
        <div class="selected-annotation-header">
          <div class="flex flex-col items-center justify-between gap-3 flex-wrap">
            <div class="av-header-items">
              <span class="sf-big text-2xl">
                <MolecularFormula ion={r.ion?.ion ?? ''} />
              </span>
              <CopyButton class="ml-1" text={r.ion?.ion ?? ''}>
                Copy ion to clipboard
              </CopyButton>
              {mzStr && (
                <span class="text-2xl flex items-baseline">
                  {mzStr}
                  <span class="ml-1 text-gray-700 text-sm">m/z</span>
                  <CopyButton class="self-start" text={mzStr}>
                    Copy m/z to clipboard
                  </CopyButton>
                </span>
              )}
            </div>
            <div class="sa-hint">Selected from results table · click volcano or another row to change</div>
          </div>
          <div class="sa-stats">
            <div>
              <span class="sa-stat-label">log₂ FC</span>
              <span
                class={[
                  'sa-stat-value',
                  lfc != null && lfc > 0 ? 'is-positive' : lfc != null && lfc < 0 ? 'is-negative' : '',
                ]}
              >
                {lfcStr}
              </span>
            </div>
            <div>
              <span class="sa-stat-label">p-value</span>
              <span class="sa-stat-value">{pStr}</span>
            </div>
            <div>
              <span class="sa-stat-label">FDR</span>
              <span class={['sa-stat-value', significant ? 'is-significant' : '']}>
                {fdrStr}
                {significant && ' *'}
              </span>
            </div>
            <div>
              <span class="sa-stat-label">Detection A / B</span>
              <span class="sa-stat-value">
                {formatPercent(r.detectionRateA)} / {formatPercent(r.detectionRateB)}
              </span>
            </div>
            <div>
              <span class="sa-stat-label">Annotation</span>
              <span class="sa-stat-value">{r.ion?.ion ?? '—'}</span>
            </div>
          </div>
        </div>
      )
    }

    const contrastSelectValue = computed(() => {
      const c = contrast.value
      if (c === null) return 'all_pairs'
      if ('omnibus' in c) return 'omnibus'
      return `${c.condA}::${c.condB}`
    })

    const onContrastChange = (v: string): void => {
      if (v === 'all_pairs') contrast.value = null
      else if (v === 'omnibus') contrast.value = { omnibus: true }
      else {
        const [ca, cb] = v.split('::')
        contrast.value = { condA: ca, condB: cb }
      }
      page.value = 1
    }

    const renderContrastSelector = () => {
      if (!showContrastSelector.value) return null
      const conds = availableConditions.value
      const pairOptions: any[] = []
      for (let i = 0; i < conds.length; i++) {
        for (let j = i + 1; j < conds.length; j++) {
          const ca = conds[i]
          const cb = conds[j]
          pairOptions.push(<ElOption key={`${ca}::${cb}`} value={`${ca}::${cb}`} label={`${ca} vs ${cb}`} />)
        }
      }
      return (
        <div class="contrast-selector mb-2 flex items-center" data-test-key="contrast-selector">
          <span class="mr-2">Contrast:</span>
          <ElSelect modelValue={contrastSelectValue.value} onChange={onContrastChange} size="small">
            <ElOption value="all_pairs" label="All pair rows" />
            <ElOption value="omnibus" label="Omnibus (any-difference)" />
            {pairOptions}
          </ElSelect>
        </div>
      )
    }

    const renderTableWrapper = () => (
      <div class="results-table-wrapper" v-loading={loading.value}>
        {renderContrastSelector()}
        <ElTable
          ref={tableRef}
          data={rows.value}
          onSortChange={onSort}
          onRowClick={onSelect}
          onCurrentChange={onSelect}
          rowClassName={rowClassName}
          highlightCurrentRow
          size="small"
          border
          stripe
          defaultSort={initialSort}
          data-test-key="results-table"
        >
          {COLUMNS.filter((c) => visibleCols.value.includes(c.id)).map((c) => (
            <ElTableColumn
              key={c.id}
              prop={c.prop}
              label={c.label}
              width={c.width}
              className={c.className}
              sortable={c.sortable ? 'custom' : false}
              formatter={c.id === 'ion' ? undefined : c.formatter}
              v-slots={
                c.id === 'ion'
                  ? {
                      default: ({ row }: any) => renderAnnotationCell(row),
                    }
                  : undefined
              }
            />
          ))}
        </ElTable>
        <div class="results-footer">
          <div>
            <ElPagination
              currentPage={page.value}
              onUpdate:currentPage={(v: number) => (page.value = v)}
              pageSize={pageSize.value}
              pageSizes={[15, 25, 50]}
              onSizeChange={(v: number) => (pageSize.value = v)}
              total={volcanoRows.value.length || 1000}
              layout="prev, pager, next, sizes"
            />
            <div class="matching-records">
              <b>{volcanoRows.value.length || rows.value.length}</b> matching{' '}
              {(volcanoRows.value.length || rows.value.length) === 1 ? 'record' : 'records'}
            </div>
            <div class="fdr-legend-row" data-test-key="fdr-legend">
              <span>FDR levels:</span>
              <span class="fdr-legend fdr-5">5%</span>
              <span class="fdr-legend fdr-10">10%</span>
              <span class="fdr-legend fdr-20">20%</span>
              <span class="fdr-legend fdr-50">50%</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <ElPopover
              width="180"
              placement="bottom-end"
              v-slots={{
                reference: () => (
                  <ElButton class="select-btn-wrapper">
                    Columns
                    <ElIcon class="select-btn-icon">
                      <ArrowDown />
                    </ElIcon>
                  </ElButton>
                ),
                default: () => (
                  <div class="columns-popover-list" data-test-key="column-picker">
                    {COLUMNS.map((c) => (
                      <div key={c.id} onClick={() => toggleCol(c.id)}>
                        <ElIcon class={visibleCols.value.includes(c.id) ? '' : 'invisible'}>
                          <Check />
                        </ElIcon>
                        <span>{c.label}</span>
                      </div>
                    ))}
                  </div>
                ),
              }}
            />
            <ElButton onClick={exportCsv} data-test-key="export-csv">
              Export to CSV
            </ElButton>
          </div>
        </div>
      </div>
    )

    const renderInfoWrapper = () => {
      ensureSelection()
      const activeNames = ['intensity', 'volcano']
      return (
        <div class="results-info-wrapper">
          {renderSelectedHeader()}
          <ElCollapse modelValue={activeNames} class="results-info-collapse">
            <ElCollapseItem
              name="intensity"
              class="ds-collapse el-collapse-item--no-padding relative"
              v-slots={{
                title: () => <span>Statistical analysis</span>,
                default: () => (
                  <div class="px-2">
                    <div class="flex justify-end mb-2">
                      <ElButton size="small" plain disabled>
                        <ElIcon class="mr-1">
                          <Download />
                        </ElIcon>
                      </ElButton>
                    </div>
                    <IntensityStripPlot
                      experimentId={props.experimentId}
                      ionId={selectedRow.value?.ion?.id ?? null}
                      fdr={selectedRow.value?.fdr ?? null}
                    />
                  </div>
                ),
              }}
            />
            <ElCollapseItem
              name="volcano"
              class="ds-collapse el-collapse-item--no-padding relative"
              v-slots={{
                title: () => <span>Volcano plot</span>,
                default: () => (
                  <div class="px-2">
                    <VolcanoPlot
                      rows={volcanoRows.value}
                      selectedIonId={selectedRow.value?.ion?.id ?? null}
                      onSelect={onVolcanoSelect}
                    />
                  </div>
                ),
              }}
            />
          </ElCollapse>
        </div>
      )
    }

    return () => {
      const empty = !loading.value && rows.value.length === 0 && liveRows.value.length === 0
      return (
        <div class="results-stage" data-test-key="results-stage">
          {empty ? (
            <ElEmpty description="No results yet" />
          ) : (
            <div class="results-grid">
              {renderTableWrapper()}
              {renderInfoWrapper()}
            </div>
          )}
        </div>
      )
    }
  },
})
