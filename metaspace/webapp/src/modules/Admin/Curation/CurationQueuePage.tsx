import { computed, defineComponent, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import { debounce } from 'lodash-es'
import moment from 'moment'
import {
  ElAutocomplete,
  ElButton,
  ElInput,
  ElLoading,
  ElOption,
  ElPagination,
  ElSelect,
  ElTabPane,
  ElTabs,
} from '../../../lib/element-plus'
import { currentUserRoleQuery } from '../../../api/user'
import {
  approveCurationTermsMutation,
  CurationDecisionResult,
  CurationTerm,
  curationTermsQuery,
  mapCurationTermsMutation,
  rejectCurationTermsMutation,
  CurationTermPage,
  CurationTermOrderBy,
  CurationTermStatus,
  submitterSuggestionsQuery,
} from '../../../api/metadataCuration'
import { CURATION_SLOT_OPTIONS } from './slotLabels'
import { CurationSort, CurationTable } from './CurationTable'
import { CurationReviewPanel } from './CurationReviewPanel'
import { BulkActionBar } from './BulkActionBar'
import { curationTermsToCsv, downloadCsv } from './exportCsv'
import './CurationQueuePage.scss'

export const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300
/** the server clamps curationTerms.limit to 200; the export pages through it up to this many rows */
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 1000

const STATUSES: { status: CurationTermStatus; label: string; count: keyof CurationTermPage['statusCounts'] }[] = [
  { status: 'PENDING', label: 'Pending', count: 'pending' },
  { status: 'APPROVED', label: 'Approved', count: 'approved' },
  { status: 'REJECTED', label: 'Rejected', count: 'rejected' },
]

/** the server sorts by submission newest first and by text alphabetically */
const sortFor = (by: CurationTermOrderBy): CurationSort => ({ by, desc: by === 'FIRST_SUBMITTED' })

const queryString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

const statusFromRoute = (value: unknown): CurationTermStatus => {
  const upper = (queryString(value) || '').toUpperCase()
  return STATUSES.find((s) => s.status === upper)?.status ?? 'PENDING'
}

const pageFromRoute = (value: unknown): number => {
  const page = parseInt(queryString(value) || '', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

interface SubmitterOption {
  id: string
  value: string
  label: string
}

export default defineComponent({
  name: 'CurationQueuePage',
  directives: { loading: ElLoading.directive },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const apolloClient: any = inject(DefaultApolloClient)

    const { result: currentUserResult, loading: currentUserLoading } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const isAdmin = computed(() => currentUserResult.value?.currentUser?.role === 'admin')

    // tab, field, search and page live in the route query; the submitter and the sort are page-local
    const status = ref<CurationTermStatus>(statusFromRoute(route.query.status))
    const slot = ref<string | null>(queryString(route.query.slot))
    const search = ref<string | null>(queryString(route.query.q))
    const searchInput = ref(search.value || '')
    const page = ref(pageFromRoute(route.query.page))
    const submitterId = ref<string | null>(null)
    const submitterInput = ref('')
    const sort = ref<CurationSort>(sortFor('FIRST_SUBMITTED'))

    // the term open in the review panel, and the bulk selection (Task 13)
    const selectedId = ref<string | null>(null)
    const selected = ref<string[]>([])
    // the skipped count of the last bulk result; reset when the user changes the selection or a filter
    const bulkSkipped = ref<number | null>(null)

    watch(
      () => route.query,
      (query) => {
        status.value = statusFromRoute(query.status)
        slot.value = queryString(query.slot)
        search.value = queryString(query.q)
        searchInput.value = search.value || ''
        page.value = pageFromRoute(query.page)
      }
    )

    const syncRoute = () => {
      const query: Record<string, string> = {}
      if (status.value !== 'PENDING') query.status = status.value.toLowerCase()
      if (slot.value) query.slot = slot.value
      if (search.value) query.q = search.value
      if (page.value > 1) query.page = String(page.value)
      router.replace({ query })
    }

    /** a filter change starts again at page 1 with nothing selected */
    const applyFilter = (change: () => void) => {
      change()
      page.value = 1
      selected.value = []
      bulkSkipped.value = null
      syncRoute()
    }

    const commitSearch = debounce((text: string) => {
      applyFilter(() => (search.value = text.trim() || null))
    }, SEARCH_DEBOUNCE_MS)
    // a search typed just before leaving must not rewrite the next page's query
    onBeforeUnmount(() => commitSearch.cancel())

    const variables = computed(() => ({
      status: status.value,
      slot: slot.value,
      submitterId: submitterId.value,
      query: search.value,
      orderBy: sort.value.by,
      offset: (page.value - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }))
    const {
      result: termsResult,
      loading: termsLoading,
      refetch: refetchTerms,
    } = useQuery<{ curationTerms: CurationTermPage }>(curationTermsQuery, variables, () => ({
      enabled: isAdmin.value,
      fetchPolicy: 'network-only',
    }))
    const termsPage = computed(() => termsResult.value?.curationTerms)
    const terms = computed(() => termsPage.value?.terms ?? [])

    /** J / K and Skip: the row after or before the reviewed one; the ends of the page stay put */
    const moveReview = (step: 1 | -1) => {
      const index = terms.value.findIndex((t) => t.id === selectedId.value)
      const row = index >= 0 ? terms.value[index + step] : undefined
      if (row) selectedId.value = row.id
    }

    /** the decided row leaves the current tab: review its neighbour, then refetch the rows and the tab counts */
    const onDecided = (term: CurationTerm) => {
      const index = terms.value.findIndex((t) => t.id === term.id)
      if (index >= 0) {
        const neighbour = terms.value[index + 1] ?? terms.value[index - 1]
        selectedId.value = neighbour?.id ?? null
      }
      selected.value = selected.value.filter((id) => id !== term.id)
      Promise.resolve(refetchTerms()).catch(() => undefined)
    }

    const { mutate: approveTerms } = useMutation<{ approveCurationTerms: CurationDecisionResult }>(
      approveCurationTermsMutation
    )
    const { mutate: mapTerms } = useMutation<{ mapCurationTerms: CurationDecisionResult }>(mapCurationTermsMutation)
    const { mutate: rejectTerms } = useMutation<{ rejectCurationTerms: CurationDecisionResult }>(
      rejectCurationTermsMutation
    )

    const bulkBusy = ref(false)
    const bulkError = ref<string | null>(null)

    /** the same decision for every selected id; the selection is cleared and the rows and counts refetched */
    const runBulk = async (
      decide: (ids: string[]) => Promise<any>,
      resultOf: (data: any) => CurationDecisionResult
    ) => {
      const ids = [...selected.value]
      if (!ids.length || bulkBusy.value || exporting.value) return
      bulkBusy.value = true
      bulkError.value = null
      try {
        const result = await decide(ids)
        const outcome = resultOf(result?.data)
        const decided = new Set((outcome?.terms ?? []).map((t) => t.id))
        // rows the server skipped (no suggestion) stay selected so the bar can report them
        selected.value = outcome?.skipped ? ids.filter((id) => !decided.has(id)) : []
        bulkSkipped.value = outcome?.skipped ?? 0
        await Promise.resolve(refetchTerms()).catch(() => undefined)
      } catch (err) {
        bulkError.value = (err as Error)?.message || 'The bulk action failed'
      } finally {
        bulkBusy.value = false
      }
    }
    const bulkApprove = () =>
      runBulk(
        (ids) => approveTerms({ input: { ids } }),
        (data) => data?.approveCurationTerms
      )
    const bulkMapSuggested = () =>
      runBulk(
        (ids) => mapTerms({ input: { ids, useSuggested: true } }),
        (data) => data?.mapCurationTerms
      )
    const bulkReject = (note: string) =>
      runBulk(
        (ids) => rejectTerms({ input: { ids, note } }),
        (data) => data?.rejectCurationTerms
      )

    const exporting = ref(false)
    const exportCsv = async () => {
      if (exporting.value || bulkBusy.value) return
      exporting.value = true
      bulkError.value = null
      try {
        const rows: CurationTerm[] = []
        let lastPageFull = false
        while (rows.length < EXPORT_MAX_ROWS) {
          const { data } = await apolloClient.query({
            query: curationTermsQuery,
            variables: { ...variables.value, offset: rows.length, limit: EXPORT_PAGE_SIZE },
            fetchPolicy: 'network-only',
          })
          const batch: CurationTerm[] = data.curationTerms.terms
          rows.push(...batch)
          lastPageFull = batch.length >= EXPORT_PAGE_SIZE
          if (!lastPageFull) break
        }
        const truncated = rows.length >= EXPORT_MAX_ROWS && lastPageFull
        const csv = (truncated ? `# export truncated at ${EXPORT_MAX_ROWS} rows\r\n` : '') + curationTermsToCsv(rows)
        downloadCsv(`curation-${status.value.toLowerCase()}-${moment().format('YYYY-MM-DD')}.csv`, csv)
      } catch (err) {
        bulkError.value = (err as Error)?.message || 'The export failed'
      } finally {
        exporting.value = false
      }
    }

    const fetchSubmitters = async (query: string, cb: (options: SubmitterOption[]) => void) => {
      if (!query) {
        cb([])
        return
      }
      try {
        const { data } = await apolloClient.query({
          query: submitterSuggestionsQuery,
          variables: { query },
          fetchPolicy: 'cache-first',
        })
        cb(data.options)
      } catch (err) {
        cb([])
      }
    }

    const onSubmitterInput = (text: string) => {
      submitterInput.value = text
      if (!text && submitterId.value) {
        applyFilter(() => (submitterId.value = null))
      }
    }

    const renderHeader = () => {
      const pending = termsPage.value?.statusCounts.pending
      return (
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-medium m-0">Curation queue</h1>
            {pending != null && <span class="curation-pill">{pending} pending</span>}
          </div>
          <ElButton disabled={exporting.value || bulkBusy.value} onClick={exportCsv}>
            ↓ Export CSV
          </ElButton>
        </div>
      )
    }

    const renderFilters = () => {
      const counts = termsPage.value?.statusCounts
      return (
        <div class="curation-toolbar">
          <ElTabs
            class="curation-tabs"
            type="card"
            modelValue={status.value}
            onTabChange={(name: string | number) => applyFilter(() => (status.value = name as CurationTermStatus))}
          >
            {STATUSES.map((s) => (
              <ElTabPane key={s.status} name={s.status} label={counts ? `${s.label} · ${counts[s.count]}` : s.label} />
            ))}
          </ElTabs>
          <div class="curation-filters">
            <ElSelect
              class="curation-filter"
              modelValue={slot.value || ''}
              placeholder="All fields"
              clearable
              onUpdate:modelValue={(v: string) => applyFilter(() => (slot.value = v || null))}
            >
              {CURATION_SLOT_OPTIONS.map((o) => (
                <ElOption key={o.slot} value={o.slot} label={o.label} />
              ))}
            </ElSelect>
            <ElAutocomplete
              class="curation-filter"
              modelValue={submitterInput.value}
              placeholder="All submitters"
              valueKey="label"
              clearable
              fetchSuggestions={fetchSubmitters}
              onUpdate:modelValue={onSubmitterInput}
              onSelect={(item: SubmitterOption) => {
                submitterInput.value = item.label
                applyFilter(() => (submitterId.value = item.id))
              }}
            />
            <ElInput
              class="curation-filter"
              modelValue={searchInput.value}
              placeholder="Search term…"
              clearable
              onUpdate:modelValue={(v: string) => {
                searchInput.value = v
                commitSearch(v)
              }}
            />
          </div>
        </div>
      )
    }

    return () => {
      if (!isAdmin.value) {
        return currentUserLoading.value ? null : <div class="mx-auto max-w-4xl py-8">Not authorised</div>
      }
      const total = termsPage.value?.total ?? 0
      return (
        <div class={['curation-queue-page', { 'curation-queue-page--reviewing': selectedId.value }]}>
          <div class="curation-queue-main">
            {renderHeader()}
            {renderFilters()}
            <div v-loading={termsLoading.value}>
              <CurationTable
                terms={terms.value}
                selected={selected.value}
                sort={sort.value}
                onSelect={(ids: string[]) => {
                  selected.value = ids
                  bulkSkipped.value = null
                }}
                onReview={(id: string) => (selectedId.value = id)}
                onSort={(by: CurationTermOrderBy) =>
                  applyFilter(() => {
                    sort.value = sortFor(by)
                  })
                }
              />
            </div>
            <BulkActionBar
              count={selected.value.length}
              busy={bulkBusy.value || exporting.value}
              skipped={bulkSkipped.value}
              onApprove={bulkApprove}
              onMapSuggested={bulkMapSuggested}
              onReject={bulkReject}
            />
            {bulkError.value && <div class="curation-bulk-error">{bulkError.value}</div>}
            {total > PAGE_SIZE && (
              <div class="flex justify-end mt-3">
                <ElPagination
                  layout="prev, pager, next"
                  pageSize={PAGE_SIZE}
                  total={total}
                  currentPage={page.value}
                  onUpdate:currentPage={(p: number) => {
                    page.value = p
                    syncRoute()
                  }}
                />
              </div>
            )}
          </div>
          {selectedId.value && (
            <CurationReviewPanel
              class="curation-queue-panel"
              termId={selectedId.value}
              onClose={() => (selectedId.value = null)}
              onNext={() => moveReview(1)}
              onPrev={() => moveReview(-1)}
              onDecided={onDecided}
            />
          )}
        </div>
      )
    }
  },
})
