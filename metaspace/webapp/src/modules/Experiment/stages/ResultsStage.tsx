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
  ElInputNumber,
} from '../../../lib/element-plus'
import { ArrowDown, Check, TopRight, WarningFilled } from '@element-plus/icons-vue'
import { RouterLink } from 'vue-router'
import * as FileSaver from 'file-saver'
import formatCsvRow from '../../../lib/formatCsvRow'
import MolecularFormula from '../../../components/MolecularFormula'
import AnnotationTableMolName from '../../Annotations/AnnotationTableMolName.vue'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import CopyButton from '../../../components/CopyButton.vue'
import { encodeParams } from '../../Filters'
import { calculateMzFromFormula } from '../../../lib/formulaParser'
import { experimentResultsQuery, experimentResultsPlotQuery, resultRowKey } from '../api'
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

const COLUMNS: ColumnDef[] = [
  { id: 'ion', prop: 'ion', width: '160', label: 'Annotation', sortable: true },
  {
    id: 'labelGroup',
    prop: 'labelGroupName',
    label: 'Group',
    width: '120',
    sortable: true,
    formatter: (row) => (row.labelGroupName === '__experiment__' ? 'All groups' : row.labelGroupName || '—'),
  },
  {
    id: 'condA',
    prop: 'condA',
    label: 'A',
    width: '110',
    sortable: true,
    formatter: (row) => row.condA ?? '—',
  },
  {
    id: 'condB',
    prop: 'condB',
    label: 'B',
    width: '110',
    sortable: true,
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
    sortable: true,
    formatter: (row) => formatPercent(row.detectionRateA),
  },
  {
    id: 'detB',
    prop: 'detectionRateB',
    label: 'det. B',
    width: '80',
    sortable: true,
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
  // Q-value (FDR) is the last column (per mockup) so the colored cell sits at
  // the right edge of the table.
  {
    id: 'fdr',
    prop: 'fdr',
    label: 'Q-value',
    width: '90',
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
    datasetIds: { type: Array as () => string[], default: () => [] },
    labelGroups: { type: Array as () => { name: string; color: string }[], default: () => [] },
    sampleIdToLabelGroup: { type: Object as () => Record<string, string>, default: () => ({}) },
    warningsPerLabelGroup: {
      type: Object as () => Record<string, string[]>,
      default: () => ({}),
    },
  },
  emits: ['update:selectedRow'],
  setup(props, { emit }) {
    const WARNING_MESSAGES: Record<string, string> = {
      PARTIAL_PAIRING:
        'Some biological replicates are paired across conditions but not all — pairing was applied where possible.',
      UNBALANCED_N: 'Conditions have unequal numbers of replicates.',
      TECH_REPS_PARTIAL: "Some regions have technical replicate IDs but others don't — identified reps were averaged.",
      MULTI_REGION_AGGREGATED: 'Multiple regions per biological replicate were averaged into a single sample.',
      EXPERIMENT_WIDE_FALLBACK: 'Insufficient data per label group — all regions were analysed together.',
    }

    // Sort state shared between the table (display) and the page query.
    // `orderBy` is what we send to the resolver. The resolver was extended to
    // accept "<col> ASC" / "<col> DESC" — see the experimentResults Query
    // resolver. Direction round-trips so clicking the same column's arrow
    // actually changes the data.
    const tableSort = ref<{ prop: string; order: 'ascending' | 'descending' }>({
      prop: 'fdr',
      order: 'ascending',
    })
    // All sorting is server-side: the resolver sorts the full set before
    // pagination so the ordering is page-consistent. `ion` sorts by molecular
    // formula (matching the Annotations table); the rest sort by their column.
    const SORTABLE_PROPS = new Set([
      'ion',
      'labelGroupName',
      'condA',
      'condB',
      'lfc',
      'pValue',
      'detectionRateA',
      'detectionRateB',
      'fdr',
    ])
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

    // Client-owned FDR/LFC/labelGroup filters — local state not sourced from ExploreStage.
    // fdrMax: null = no filter; otherwise restrict to rows where fdr <= fdrMax.
    // lfcAbsMin: null = no filter; otherwise restrict to |lfc| >= lfcAbsMin.
    // localLabelGroup: null = all groups; otherwise restrict to a single label group.
    const localFdrMax = ref<number | null>(null)
    const localLfcAbsMin = ref<number | null>(null)
    const localLabelGroup = ref<string | null>(null)

    // Active warnings to show: either the selected label group's or all groups.
    const visibleWarnings = computed<Array<{ group: string; messages: string[] }>>(() => {
      const wplg = props.warningsPerLabelGroup
      if (!wplg || Object.keys(wplg).length === 0) return []
      const activeKey = localLabelGroup.value
      const keys = activeKey ? [activeKey] : Object.keys(wplg)
      return keys
        .filter((k) => (wplg[k] ?? []).length > 0)
        .map((k) => ({
          group: k === '__experiment__' ? 'All groups' : k,
          messages: (wplg[k] ?? []).map((code) => WARNING_MESSAGES[code] ?? code),
        }))
    })

    // Strip fdrMax from the parent filter so ExploreStage's threshold doesn't
    // leak into ResultsStage — results are unfiltered by default here.
    const serverFilter = computed(() => {
      const rest = Object.fromEntries(Object.entries(props.filter ?? {}).filter(([k]) => k !== 'fdrMax'))
      return {
        ...rest,
        ...(localFdrMax.value != null ? { fdrMax: localFdrMax.value } : {}),
        ...(localLfcAbsMin.value != null ? { lfcAbsMin: localLfcAbsMin.value } : {}),
        ...(localLabelGroup.value != null ? { labelGroupName: localLabelGroup.value } : {}),
        ...(contrast.value ? { contrast: contrast.value } : {}),
      }
    })

    const { result, loading } = useQuery(
      experimentResultsQuery,
      () => ({
        experimentId: props.experimentId,
        filter: serverFilter.value,
        orderBy: orderBy.value,
        limit: pageSize.value,
        offset: offset.value,
      }),
      // `annotation` is a best-effort per-row field; a failure on one row must
      // not blank the whole table. errorPolicy 'all' keeps the returned rows
      // (with that row's annotation null) instead of discarding all data.
      { errorPolicy: 'all' }
    )

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
    const { result: volcanoResult }: any = useQuery(experimentResultsPlotQuery, () => ({
      experimentId: props.experimentId,
      filter: serverFilter.value,
      // Mirror the table's sort so `volcanoRows.findIndex(...)` yields the
      // row's absolute position under the current ordering — needed to jump
      // the table to the correct page when a volcano dot is clicked.
      orderBy: orderBy.value,
      limit: VOLCANO_LIMIT,
      offset: 0,
    }))
    const volcanoRows = computed<ResultRow[]>(() => volcanoResult.value?.experimentResults ?? [])

    const showLabelGroupSelector = computed(() => props.labelGroups.length >= 2)

    // Available conditions — discovered from the full volcano dataset so the
    // contrast selector shows all conditions, not just the current page.
    const availableConditions = computed<string[]>(() => {
      const all = volcanoRows.value as Array<{ condA?: string | null; condB?: string | null }>
      const set = new Set<string>()
      for (const r of all) {
        if (r.condA) set.add(r.condA)
        if (r.condB) set.add(r.condB)
      }
      return Array.from(set).sort()
    })
    const showContrastSelector = computed(() => availableConditions.value.length >= 3)

    const visibleCols = ref<string[]>(COLUMNS.filter((c) => c.id !== 'nA' && c.id !== 'nB').map((c) => c.id))
    const selectedRow = ref<any | null>(null)
    const tableRef = ref<any>(null)
    const rowKey = resultRowKey

    const ensureSelection = (): void => {
      if (selectedRow.value == null && rows.value.length > 0) {
        selectedRow.value = rows.value[0]
        emit('update:selectedRow', rows.value[0])
      }
    }

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
      if (selectedRow.value == null) return -1
      const key = rowKey(selectedRow.value)
      return rows.value.findIndex((r) => rowKey(r) === key)
    })
    // After a page change the new page's rows arrive asynchronously — when
    // a navigation action requires "select first/last of the next page" we
    // stash the target index and apply it once the new rows are in.
    const pendingSelectIndex = ref<number | null>(null)
    // Set when a volcano click triggers a page change — the new page's row
    // matching this composite key (ion + group + contrast) is selected once it
    // arrives, so the exact clicked group's row is highlighted.
    const pendingSelectKey = ref<string | null>(null)
    watch(rows, (newRows) => {
      if (newRows.length === 0) return
      if (pendingSelectKey.value != null) {
        const match = newRows.find((r) => rowKey(r) === pendingSelectKey.value)
        if (match) onSelect(match)
        pendingSelectKey.value = null
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

    const onVolcanoSelect = (row: any): void => {
      const key = rowKey(row)
      const absoluteIdx = volcanoRows.value.findIndex((r) => rowKey(r) === key)
      if (absoluteIdx === -1) {
        // Fallback — pick from current page if the volcano query hasn't
        // resolved yet, so the right column at least updates.
        const cur = rows.value.find((r) => rowKey(r) === key) ?? row
        onSelect(cur)
        return
      }
      const targetPage = Math.floor(absoluteIdx / pageSize.value) + 1
      if (targetPage !== page.value) {
        // Defer row selection until the new page's rows arrive — the watch
        pendingSelectKey.value = key
        page.value = targetPage
      } else {
        const cur = rows.value.find((r) => rowKey(r) === key) ?? volcanoRows.value[absoluteIdx]
        onSelect(cur)
      }
    }

    const rowClassName = (info: any): string => {
      const fdr = info.row?.fdr
      const isCurrent = selectedRow.value != null && rowKey(info.row) === rowKey(selectedRow.value)
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
      // Export all rows from the volcano query (up to VOLCANO_LIMIT), not just the current page.
      const allRows = volcanoRows.value.length > 0 ? volcanoRows.value : rows.value
      const cols = COLUMNS.filter((c) => visibleCols.value.includes(c.id))
      const header = cols.map((c) => c.label)
      let csv = formatCsvRow(header)
      for (const r of allRows) {
        const cells = cols.map((c) => {
          if (c.id === 'ion') return (r as any).ion?.ion ?? ''
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

    const annotationFor = (row: any) =>
      row?.annotation ?? {
        id: row?.ion?.id,
        ion: row?.ion?.ion ?? '',
        sumFormula: row?.ion?.formula ?? '',
        possibleCompounds: [],
      }

    const annotationsLinkFor = (row: any) => {
      const ann = row?.annotation
      const formula = ann?.sumFormula ?? row?.ion?.formula ?? ''
      const q: Record<string, unknown> = { datasetIds: [...props.datasetIds], compoundName: formula }
      if (ann?.databaseDetails?.id) q.database = ann.databaseDetails.id
      return { name: 'annotations', query: encodeParams(q, '/annotations') }
    }
    const renderAnnotationCell = (row: any) => {
      if (!row?.ion?.ion) return <span>—</span>
      const canLink = props.datasetIds.length > 0 && !!(row?.annotation?.sumFormula ?? row?.ion?.formula)
      return (
        <div class="exp-annotation-cell">
          <AnnotationTableMolName annotation={annotationFor(row)} hideFilter />
          {canLink && (
            <RouterLink
              to={annotationsLinkFor(row)}
              target="_blank"
              class="exp-annotation-link"
              title="Open in annotations (filtered to this experiment's datasets)"
              onClick={(e: Event) => e.stopPropagation()}
            >
              <ElIcon>
                <TopRight />
              </ElIcon>
            </RouterLink>
          )}
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
              <CandidateMoleculesPopover
                class="sf-big text-2xl"
                placement="bottom"
                possibleCompounds={r.annotation?.possibleCompounds ?? []}
                limit={10}
              >
                <MolecularFormula ion={r.ion?.ion ?? ''} />
              </CandidateMoleculesPopover>
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
              <span class="sa-stat-label">Q-value</span>
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

    const contrastPairOptions = computed(() => {
      const conds = availableConditions.value
      const pairOptions: any[] = []
      for (let i = 0; i < conds.length; i++) {
        for (let j = i + 1; j < conds.length; j++) {
          const ca = conds[i]
          const cb = conds[j]
          pairOptions.push(<ElOption key={`${ca}::${cb}`} value={`${ca}::${cb}`} label={`${ca} vs ${cb}`} />)
        }
      }
      return pairOptions
    })

    const renderWarningIndicator = () => {
      if (visibleWarnings.value.length === 0) return null
      const total = visibleWarnings.value.reduce((n, w) => n + w.messages.length, 0)
      return (
        <ElPopover
          placement="bottom-start"
          width={380}
          trigger="hover"
          teleported={false}
          v-slots={{
            reference: () => (
              <span class="results-warning-chip" data-test-key="results-warning-banner" tabindex="0">
                <ElIcon>
                  <WarningFilled />
                </ElIcon>
                <span>These results have {total === 1 ? 'a warning' : `${total} warnings`}</span>
              </span>
            ),
            default: () => (
              <div class="results-warning-popover" data-test-key="results-warning-content">
                {visibleWarnings.value.map((w) => (
                  <div key={w.group} class="mb-2 last:mb-0">
                    <div class="font-medium text-gray-800">{w.group}</div>
                    <ul class="mt-1 mb-0 pl-4 text-sm text-gray-600">
                      {w.messages.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ),
          }}
        />
      )
    }

    const renderTopFilterBar = () => (
      <div class="results-filter-bar" data-test-key="results-filter-bar">
        <div class="rfb-filters">
          <div class="rfb-item">
            <span class="rfb-label">Q-value ≤</span>
            <ElSelect
              modelValue={localFdrMax.value === null ? '' : String(localFdrMax.value)}
              placeholder="Any"
              clearable
              size="small"
              style={{ width: '90px' }}
              data-test-key="filter-fdr-max"
              onChange={(v: string) => {
                localFdrMax.value = v ? Number(v) : null
                page.value = 1
              }}
              onClear={() => {
                localFdrMax.value = null
                page.value = 1
              }}
            >
              <ElOption value="0.05" label="5%" />
              <ElOption value="0.1" label="10%" />
              <ElOption value="0.2" label="20%" />
              <ElOption value="0.5" label="50%" />
            </ElSelect>
          </div>
          <div class="rfb-item">
            <span class="rfb-label">|LFC| ≥</span>
            <ElInputNumber
              modelValue={localLfcAbsMin.value ?? undefined}
              onUpdate:modelValue={(v: number | undefined) => {
                localLfcAbsMin.value = v ?? null
                page.value = 1
              }}
              min={0}
              step={0.5}
              precision={1}
              controls={false}
              size="small"
              placeholder="any"
              style={{ width: '80px' }}
              data-test-key="filter-lfc-min"
            />
          </div>
          {showLabelGroupSelector.value && (
            <div class="rfb-item">
              <span class="rfb-label">Groups:</span>
              <ElSelect
                modelValue={localLabelGroup.value ?? ''}
                placeholder="All groups"
                clearable
                size="small"
                style={{ width: '160px' }}
                data-test-key="filter-label-group"
                onChange={(v: string) => {
                  localLabelGroup.value = v || null
                  page.value = 1
                }}
                onClear={() => {
                  localLabelGroup.value = null
                  page.value = 1
                }}
              >
                {props.labelGroups.map((g) => (
                  <ElOption key={g.name} value={g.name} label={g.name} />
                ))}
              </ElSelect>
            </div>
          )}
          {showContrastSelector.value && (
            <div class="rfb-item" data-test-key="contrast-selector">
              <span class="rfb-label">Contrast:</span>
              <ElSelect
                modelValue={contrastSelectValue.value}
                onChange={onContrastChange}
                size="small"
                style={{ width: '190px' }}
              >
                <ElOption value="all_pairs" label="All pair rows" />
                <ElOption value="omnibus" label="Omnibus (any-difference)" />
                {contrastPairOptions.value}
              </ElSelect>
            </div>
          )}
        </div>
        {renderWarningIndicator()}
      </div>
    )

    const renderTableWrapper = () => (
      <div class="results-table-wrapper" v-loading={loading.value}>
        <ElTable
          ref={tableRef}
          data={rows.value}
          onSortChange={onSort}
          onRowClick={onSelect}
          rowClassName={rowClassName}
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
              <span>Q-value levels:</span>
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
                    <IntensityStripPlot
                      experimentId={props.experimentId}
                      ionId={selectedRow.value?.ion?.id ?? null}
                      fdr={selectedRow.value?.fdr ?? null}
                      {...{
                        sampleIdToLabelGroup: props.sampleIdToLabelGroup,
                        labelGroupFilter: localLabelGroup.value,
                      }}
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
                      fdrThreshold={localFdrMax.value ?? 0.05}
                      selectedKey={selectedRow.value ? rowKey(selectedRow.value) : null}
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
          {/* The filter bar is always rendered — even when the current filters
              match no rows — so the user can always adjust or clear them. */}
          {renderTopFilterBar()}
          {empty ? (
            <ElEmpty description="No results match the current filters — try adjusting or clearing them above." />
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
