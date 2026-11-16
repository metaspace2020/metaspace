import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import CurationQueuePage from './CurationQueuePage'
import { CurationTable } from './CurationTable'
import { CurationReviewPanel } from './CurationReviewPanel'
import { BulkActionBar } from './BulkActionBar'
import { curationTermsQuery } from '../../../api/metadataCuration'
import { currentUserRoleQuery } from '../../../api/user'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { ElAutocomplete, ElInput, ElSelect } from '../../../lib/element-plus'
import store from '../../../store'
import router from '../../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

const TERM = {
  id: 't1',
  slot: 'sample_stabilisation',
  text: 'Organoid',
  normalizedText: 'organoid',
  status: 'PENDING',
  canonicalLabel: null,
  ontologyId: null,
  aliases: [],
  suggestedOntologyId: null,
  suggestedLabel: null,
  suggestedScore: null,
  note: null,
  datasetId: '2026-10-14_12h00m00s',
  datasetName: 'patient_colon',
  submitter: { id: 'u1', name: 'Lucas Vieira' },
  submittedAt: '2026-10-14T12:00:00.000Z',
  createdAt: '2026-10-14T12:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  applyState: 'IDLE',
  appliedCount: 0,
}

const PAGE = {
  terms: [TERM],
  total: 14,
  statusCounts: { pending: 14, approved: 182, rejected: 23 },
}

const TERM_2 = { ...TERM, id: 't2', text: 'AP-SMALDI5', slot: 'ionization_source' }
const TERM_3 = { ...TERM, id: 't3', text: 'TM-Sprayer', slot: 'maldi_matrix_application' }
const THREE_ROWS = { ...PAGE, terms: [TERM, TERM_2, TERM_3] }

let graphqlMocks: any
let termsResult: any
let termsRefetch: any
let mutateMock: any

describe('CurationQueuePage', () => {
  const mockQueries = async (role: string, page: any) => {
    graphqlMocks = await initMockGraphqlClient({})
    termsResult = ref({ curationTerms: page })
    termsRefetch = vi.fn()
    ;(useQuery as any).mockImplementation((doc: unknown) => ({
      result:
        doc === curationTermsQuery
          ? termsResult
          : ref(doc === currentUserRoleQuery ? { currentUser: { id: 'u1', name: 'Lucas Vieira', role } } : undefined),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: doc === curationTermsQuery ? termsRefetch : vi.fn(),
    }))
    mutateMock = vi.fn()
    ;(useMutation as any).mockReturnValue({ mutate: mutateMock })
  }

  /** the reactive variables of the latest curationTerms useQuery call */
  const termsVariables = () => {
    const calls = (useQuery as any).mock.calls.filter((c: unknown[]) => c[0] === curationTermsQuery)
    const vars = calls[calls.length - 1][1]
    return typeof vars === 'function' ? vars() : vars.value
  }

  const build = async (role = 'admin', page: any = PAGE) => {
    await mockQueries(role, page)
    await router.replace({ path: '/admin/curation', query: {} })
    const wrapper = mount(CurationQueuePage, {
      global: { plugins: [store, router], provide: { [DefaultApolloClient as any]: graphqlMocks } },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the page for non-admins', async () => {
    const wrapper = await build('user')
    expect(wrapper.text()).toContain('Not authorised')
    expect(wrapper.findComponent(CurationTable).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Curation queue')
  })

  it('renders tabs with counts and the pending pill', async () => {
    const wrapper = await build()
    const text = wrapper.text()
    expect(text).toContain('Curation queue')
    expect(wrapper.find('.curation-pill').text()).toBe('14 pending')
    expect(text).toContain('Pending · 14')
    expect(text).toContain('Approved · 182')
    expect(text).toContain('Rejected · 23')
    expect(text).not.toContain('Vocabulary admin')
    const exportButton = wrapper.findAll('button').find((b) => b.text().includes('Export CSV'))
    expect(exportButton?.attributes('disabled')).toBeUndefined()
    expect(wrapper.findComponent(CurationTable).props('terms')).toEqual([TERM])
    expect(termsVariables()).toMatchObject({ status: 'PENDING', orderBy: 'FIRST_SUBMITTED', offset: 0, limit: 50 })
    expect(wrapper.findComponent(CurationTable).props('sort')).toEqual({ by: 'FIRST_SUBMITTED', desc: true })
  })

  it('changing the field filter refetches with the slot', async () => {
    const wrapper = await build()
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'disease')
    await flushPromises()
    expect(termsVariables()).toMatchObject({ slot: 'disease', offset: 0 })
    expect(router.currentRoute.value.query.slot).toBe('disease')
  })

  it('typing in search debounces into the query variable', async () => {
    const wrapper = await build()
    vi.useFakeTimers()
    wrapper.findComponent(ElInput).vm.$emit('update:modelValue', 'organ')
    await nextTick()
    vi.advanceTimersByTime(299)
    expect(termsVariables().query).toBeNull()
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(termsVariables().query).toBe('organ')
    vi.useRealTimers()
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('organ')
  })

  it('sorting and switching tabs refetch with the order and the status', async () => {
    const wrapper = await build()
    wrapper.findComponent(CurationTable).vm.$emit('sort', 'TEXT')
    await nextTick()
    expect(termsVariables()).toMatchObject({ orderBy: 'TEXT' })
    expect(wrapper.findComponent(CurationTable).props('sort')).toEqual({ by: 'TEXT', desc: false })
    const approvedTab = wrapper.findAll('.el-tabs__item').find((t) => t.text().startsWith('Approved'))
    await approvedTab!.trigger('click')
    await flushPromises()
    expect(termsVariables()).toMatchObject({ status: 'APPROVED', offset: 0 })
    expect(router.currentRoute.value.query.status).toBe('approved')
  })

  it('a pending search is cancelled on unmount', async () => {
    const wrapper = await build()
    const replace = vi.spyOn(router, 'replace')
    vi.useFakeTimers()
    wrapper.findComponent(ElInput).vm.$emit('update:modelValue', 'organ')
    await nextTick()
    vi.advanceTimersByTime(100)
    wrapper.unmount()
    vi.advanceTimersByTime(500)
    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })

  it('keeps the search box in sync with the route query', async () => {
    const wrapper = await build()
    await router.replace({ path: '/admin/curation', query: { q: 'mouse' } })
    await flushPromises()
    expect(wrapper.findComponent(ElInput).props('modelValue')).toBe('mouse')
    expect(termsVariables().query).toBe('mouse')
    await router.replace({ path: '/admin/curation', query: {} })
    await flushPromises()
    expect(wrapper.findComponent(ElInput).props('modelValue')).toBe('')
  })

  const press = async (key: string, target: EventTarget = window) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await nextTick()
  }
  const panel = (wrapper: any) => wrapper.findComponent(CurationReviewPanel)

  it('J and K move the reviewed term', async () => {
    const wrapper = await build('admin', THREE_ROWS)
    expect(panel(wrapper).exists()).toBe(false)
    wrapper.findComponent(CurationTable).vm.$emit('review', 't1')
    await nextTick()
    expect(panel(wrapper).props('termId')).toBe('t1')
    await press('j')
    expect(panel(wrapper).props('termId')).toBe('t2')
    await press('j')
    await press('j')
    expect(panel(wrapper).props('termId')).toBe('t3')
    await press('k')
    await press('k')
    expect(panel(wrapper).props('termId')).toBe('t1')
    await press('k')
    expect(panel(wrapper).props('termId')).toBe('t1')

    // ignored while typing
    const search = wrapper.findComponent(ElInput).find('input')
    await press('j', search.element)
    expect(panel(wrapper).props('termId')).toBe('t1')

    panel(wrapper).vm.$emit('next')
    await nextTick()
    expect(panel(wrapper).props('termId')).toBe('t2')
    await press('Escape')
    expect(panel(wrapper).exists()).toBe(false)
    await press('j')
    expect(panel(wrapper).exists()).toBe(false)
  })

  it('a decision removes the row from the Pending tab and refetches counts', async () => {
    const wrapper = await build('admin', THREE_ROWS)
    termsRefetch.mockImplementation(() => {
      termsResult.value = {
        curationTerms: {
          terms: [TERM_2, TERM_3],
          total: 13,
          statusCounts: { pending: 13, approved: 183, rejected: 23 },
        },
      }
    })
    wrapper.findComponent(CurationTable).vm.$emit('select', ['t1', 't3'])
    wrapper.findComponent(CurationTable).vm.$emit('review', 't1')
    await nextTick()
    panel(wrapper).vm.$emit('decided', { ...TERM, status: 'APPROVED' })
    await flushPromises()
    expect(termsRefetch).toHaveBeenCalledTimes(1)
    expect(
      wrapper
        .findComponent(CurationTable)
        .props('terms')
        .map((t: any) => t.id)
    ).toEqual(['t2', 't3'])
    expect(wrapper.findComponent(CurationTable).props('selected')).toEqual(['t3'])
    expect(wrapper.find('.curation-pill').text()).toBe('13 pending')
    expect(wrapper.text()).toContain('Approved · 183')
    expect(panel(wrapper).props('termId')).toBe('t2')

    // deciding the last row moves back to the previous one
    panel(wrapper).vm.$emit('next')
    await nextTick()
    termsRefetch.mockImplementation(() => {
      termsResult.value = { curationTerms: { ...THREE_ROWS, terms: [TERM_2] } }
    })
    panel(wrapper).vm.$emit('decided', { ...TERM_3, status: 'REJECTED' })
    await flushPromises()
    expect(panel(wrapper).props('termId')).toBe('t2')
  })

  it('Export CSV pages through the filters 200 rows at a time and downloads one file', async () => {
    const wrapper = await build()
    const rowsOf = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ ...TERM, id: `e${from + i}`, text: `term ${from + i}` }))
    const query = vi
      .spyOn(graphqlMocks, 'query')
      .mockResolvedValueOnce({ data: { curationTerms: { ...PAGE, terms: rowsOf(200, 0) } } } as any)
      .mockResolvedValueOnce({ data: { curationTerms: { ...PAGE, terms: rowsOf(50, 200) } } } as any)
    let blob: Blob | undefined
    ;(URL as any).createObjectURL = vi.fn((b: Blob) => {
      blob = b
      return 'blob:x'
    })
    ;(URL as any).revokeObjectURL = vi.fn()
    const downloads: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Export CSV'))!
      .trigger('click')
    await flushPromises()

    expect(query).toHaveBeenCalledTimes(2)
    expect((query.mock.calls[0][0] as any).variables).toMatchObject({ status: 'PENDING', offset: 0, limit: 200 })
    expect((query.mock.calls[1][0] as any).variables).toMatchObject({ status: 'PENDING', offset: 200, limit: 200 })
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(/^curation-pending-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob!)
    })
    const lines = text.split('\r\n').filter(Boolean)
    expect(lines[0].startsWith('typed_term,')).toBe(true)
    expect(lines).toHaveLength(251)
    click.mockRestore()
    query.mockRestore()
  })

  it('a bulk approve sends all selected ids, clears the selection and refetches', async () => {
    const remounted = await build('admin', THREE_ROWS)
    const mutate = mutateMock
    mutate.mockResolvedValue({ data: { approveCurationTerms: { terms: [], skipped: 0 } } })
    remounted.findComponent(CurationTable).vm.$emit('select', ['t1', 't2'])
    await nextTick()
    expect(remounted.findComponent(BulkActionBar).text()).toContain('2 selected')
    await remounted
      .findComponent(BulkActionBar)
      .findAll('button')
      .find((b) => b.text().includes('Approve'))!
      .trigger('click')
    await flushPromises()
    expect(mutate).toHaveBeenCalledWith({ input: { ids: ['t1', 't2'] } })
    expect(remounted.findComponent(CurationTable).props('selected')).toEqual([])
    expect(termsRefetch).toHaveBeenCalled()
    expect(remounted.find('.curation-bulk-bar').exists()).toBe(false)
  })

  const rowsOf = (n: number, from: number) =>
    Array.from({ length: n }, (_, i) => ({ ...TERM, id: `e${from + i}`, text: `term ${from + i}` }))

  /** stubs the download and resolves with the CSV text once Export CSV was clicked */
  const runExport = async (wrapper: any) => {
    let blob: Blob | undefined
    ;(URL as any).createObjectURL = vi.fn((b: Blob) => {
      blob = b
      return 'blob:x'
    })
    ;(URL as any).revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await wrapper
      .findAll('button')
      .find((b: any) => b.text().includes('Export CSV'))!
      .trigger('click')
    await flushPromises()
    click.mockRestore()
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob!)
    })
  }

  it('Export CSV stops at 1000 rows and marks the file as truncated', async () => {
    const wrapper = await build()
    const query = vi.spyOn(graphqlMocks, 'query').mockImplementation((async (opts: any) => ({
      data: { curationTerms: { ...PAGE, terms: rowsOf(200, opts.variables.offset) } },
    })) as any)
    const text = await runExport(wrapper)
    expect(query).toHaveBeenCalledTimes(5)
    const lines = text.split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('# export truncated at 1000 rows')
    expect(lines[1].startsWith('typed_term,')).toBe(true)
    expect(lines).toHaveLength(1002)
    query.mockRestore()
  })

  it('Export CSV carries the current search, submitter and sort', async () => {
    const wrapper = await build()
    await router.replace({ path: '/admin/curation', query: { q: 'mouse' } })
    await flushPromises()
    wrapper.findComponent(ElAutocomplete).vm.$emit('select', { id: 'u9', value: 'X', label: 'X' })
    wrapper.findComponent(CurationTable).vm.$emit('sort', 'TEXT')
    await flushPromises()
    const query = vi
      .spyOn(graphqlMocks, 'query')
      .mockResolvedValue({ data: { curationTerms: { ...PAGE, terms: rowsOf(3, 0) } } } as any)
    await runExport(wrapper)
    expect((query.mock.calls[0][0] as any).variables).toMatchObject({
      query: 'mouse',
      submitterId: 'u9',
      orderBy: 'TEXT',
      status: 'PENDING',
      offset: 0,
      limit: 200,
    })
    query.mockRestore()
  })

  const clickBulk = async (wrapper: any, label: string) => {
    wrapper.findComponent(CurationTable).vm.$emit('select', ['t1', 't2'])
    await nextTick()
    await wrapper
      .findComponent(BulkActionBar)
      .findAll('button')
      .find((b: any) => b.text().includes(label))!
      .trigger('click')
    await flushPromises()
  }

  it('a failed bulk mutation shows the error, keeps the selection and does not refetch', async () => {
    const wrapper = await build('admin', THREE_ROWS)
    mutateMock.mockRejectedValue(new Error('boom'))
    await clickBulk(wrapper, 'Approve')
    expect(wrapper.text()).toContain('boom')
    expect(wrapper.findComponent(CurationTable).props('selected')).toEqual(['t1', 't2'])
    expect(termsRefetch).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BulkActionBar).findAll('button')[0].attributes('disabled')).toBeUndefined()
  })

  it('Map to suggested sends useSuggested and reports the skipped rows', async () => {
    const wrapper = await build('admin', THREE_ROWS)
    mutateMock.mockResolvedValue({ data: { mapCurationTerms: { terms: [{ id: 't1' }], skipped: 1 } } })
    await clickBulk(wrapper, 'Map to suggested')
    expect(mutateMock).toHaveBeenCalledWith({ input: { ids: ['t1', 't2'], useSuggested: true } })
    expect(termsRefetch).toHaveBeenCalled()
    expect(wrapper.findComponent(BulkActionBar).text()).toContain('1 skipped (no suggestion)')
    expect(wrapper.findComponent(CurationTable).props('selected')).toEqual(['t2'])
    // changing the selection drops the notice
    wrapper.findComponent(CurationTable).vm.$emit('select', ['t2', 't3'])
    await nextTick()
    expect(wrapper.findComponent(BulkActionBar).text()).not.toContain('skipped')
  })

  it('Reject sends the ids with the note', async () => {
    const wrapper = await build('admin', THREE_ROWS)
    mutateMock.mockResolvedValue({ data: { rejectCurationTerms: { terms: [], skipped: 0 } } })
    wrapper.findComponent(CurationTable).vm.$emit('select', ['t1', 't2'])
    await nextTick()
    wrapper.findComponent(BulkActionBar).vm.$emit('reject', 'not a term')
    await flushPromises()
    expect(mutateMock).toHaveBeenCalledWith({ input: { ids: ['t1', 't2'], note: 'not a term' } })
    expect(wrapper.findComponent(CurationTable).props('selected')).toEqual([])
  })
})
