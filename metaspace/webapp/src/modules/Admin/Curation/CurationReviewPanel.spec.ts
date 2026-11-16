import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useMutation, useQuery } from '@vue/apollo-composable'
import { CurationReviewPanel } from './CurationReviewPanel'
import {
  approveCurationTermsMutation,
  curationTermQuery,
  curationTermsQuery,
  mapCurationTermsMutation,
  rejectCurationTermsMutation,
  retryCurationApplyMutation,
} from '../../../api/metadataCuration'
import { fetchOntologyTermSuggestionsQuery } from '../../../api/metadata'
import { ElInput, ElRadioGroup } from '../../../lib/element-plus'
import router from '../../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

const ORGANOID = {
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
  datasetName: '2026-10-14_patient_colon',
  submitter: { id: 'u1', name: 'Lucas Vieira' },
  submittedAt: '2026-10-09T12:00:00.000Z',
  createdAt: '2026-10-14T12:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  applyState: 'IDLE',
  appliedCount: 0,
}

const AP_MALDI = {
  ...ORGANOID,
  id: 't2',
  slot: 'ionization_source',
  text: 'AP-SMALDI5',
  normalizedText: 'ap-smaldi5',
  suggestedOntologyId: 'MS:1000397',
  suggestedLabel: 'AP-MALDI',
  suggestedScore: 0.84,
}

describe('CurationReviewPanel', () => {
  let termResult: any
  let termRefetch: any
  let mutations: Map<unknown, any>

  const build = async (term: any, apolloClient: any = {}) => {
    termResult = ref({ curationTerm: term })
    termRefetch = vi.fn()
    ;(useQuery as any).mockImplementation((doc: unknown) => ({
      result: doc === curationTermQuery ? termResult : ref(undefined),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: doc === curationTermQuery ? termRefetch : vi.fn(),
    }))
    mutations = new Map([
      [
        approveCurationTermsMutation,
        vi.fn(async () => ({ data: { approveCurationTerms: { terms: [term], skipped: 0 } } })),
      ],
      [mapCurationTermsMutation, vi.fn(async () => ({ data: { mapCurationTerms: { terms: [term], skipped: 0 } } }))],
      [
        rejectCurationTermsMutation,
        vi.fn(async () => ({ data: { rejectCurationTerms: { terms: [term], skipped: 0 } } })),
      ],
      [retryCurationApplyMutation, vi.fn(async () => ({ data: { retryCurationApply: term } }))],
    ])
    ;(useMutation as any).mockImplementation((doc: unknown) => ({ mutate: mutations.get(doc) }))
    const wrapper = mount(CurationReviewPanel, {
      props: { termId: term.id },
      // the real RouterLink (setupTests stubs it): a link with a missing route param must fail here
      global: {
        plugins: [router],
        stubs: { RouterLink: false },
        provide: { [DefaultApolloClient as any]: apolloClient },
      },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  const primaryButton = (wrapper: any) => wrapper.find('.curation-primary')
  const noteInput = (wrapper: any) => wrapper.findAllComponents(ElInput).find((c: any) => c.classes('curation-note'))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('prefills the canonical label with the typed text and shows the dataset line', async () => {
    const wrapper = await build(ORGANOID)
    const text = wrapper.text()
    expect(text).toContain('Organoid')
    expect(wrapper.find('.curation-pill').text()).toBe('pending')
    expect(text).toContain('Sample stabilisation · curated list')
    const usage = wrapper.find('.curation-usage')
    expect(usage.text()).toBe('2026-10-14_patient_colon · Lucas Vieira · 9 Oct 2026')
    expect(usage.find('a').attributes('href')).toBe('/dataset/2026-10-14_12h00m00s')
    expect(text).not.toContain('Used in')
    expect(text).not.toContain('more')
    expect((useQuery as any).mock.calls.every((c: unknown[]) => c[0] === curationTermQuery)).toBe(true)
    const canonical = wrapper.findAllComponents(ElInput).find((c: any) => c.classes('curation-canonical'))
    expect(canonical!.props('modelValue')).toBe('Organoid')
    expect(text).toContain('Adds "Organoid" to the Sample stabilisation values for everyone.')
    expect(primaryButton(wrapper).text()).toBe('✓ Approve & apply')
  })

  it('the dataset line falls back to the dataset id and skips a missing submitter', async () => {
    const wrapper = await build({ ...ORGANOID, datasetName: null, submitter: null })
    const usage = wrapper.find('.curation-usage')
    expect(usage.text()).toBe('2026-10-14_12h00m00s · 9 Oct 2026')
    expect(usage.find('a').text()).toBe('2026-10-14_12h00m00s')
    expect(usage.find('a').attributes('href')).toBe('/dataset/2026-10-14_12h00m00s')
  })

  it('prefills map for an unbound slot with the approved row named by the suggestion', async () => {
    // "Cryo frozen" is no seed value of the slot, so only an approved row can be the target
    const fresh = { ...ORGANOID, id: 't5', text: 'Cryo-frozen, OCT', suggestedLabel: 'Cryo frozen' }
    const approvedRow = {
      ...ORGANOID,
      id: 't7',
      status: 'APPROVED',
      text: 'cryo frozen',
      canonicalLabel: 'Cryo frozen',
    }
    const other = {
      ...ORGANOID,
      id: 't8',
      status: 'APPROVED',
      text: 'Cryo frozen in OCT',
      canonicalLabel: 'Cryo frozen in OCT',
    }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [other, approvedRow] } } })) }
    const wrapper = await build(fresh, client)
    expect(client.query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: curationTermsQuery,
        variables: { status: 'APPROVED', slot: 'sample_stabilisation', query: 'Cryo frozen', limit: 8 },
      })
    )
    expect(wrapper.findComponent(ElRadioGroup).props('modelValue')).toBe('map')
    expect(wrapper.find('.curation-map').attributes('modelvalue')).toBe('Cryo frozen')
    expect(wrapper.find('.curation-target').text()).toBe('Cryo frozen')
    expect(primaryButton(wrapper).text()).toBe('Map & apply')
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(mapCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t5'], targetTermId: 't7', note: null },
    })
  })

  it('falls back to approve when an unbound suggestion matches no approved row', async () => {
    const fresh = { ...ORGANOID, id: 't5', suggestedLabel: 'Cryo frozen' }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [] } } })) }
    const wrapper = await build(fresh, client)
    expect(wrapper.findComponent(ElRadioGroup).props('modelValue')).toBe('approve')
    expect(primaryButton(wrapper).text()).toBe('✓ Approve & apply')
  })

  it('a seed suggestion is prefilled as the map target and the button is enabled', async () => {
    const washed = { ...ORGANOID, id: 't5', slot: 'tissue_modification', text: 'washedx', suggestedLabel: 'washed' }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [] } } })) }
    const wrapper = await build(washed, client)
    expect(wrapper.findComponent(ElRadioGroup).props('modelValue')).toBe('map')
    expect(wrapper.find('.curation-target').text()).toBe('Washed')
    expect(primaryButton(wrapper).text()).toBe('Map & apply')
    expect(primaryButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('mapping to a seed value approves with that label', async () => {
    const washed = { ...ORGANOID, id: 't5', slot: 'tissue_modification', text: 'washedx', suggestedLabel: 'Washed' }
    const wrapper = await build(washed, { query: vi.fn(async () => ({ data: { curationTerms: { terms: [] } } })) })
    noteInput(wrapper)!.vm.$emit('update:modelValue', 'seed')
    await nextTick()
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(approveCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t5'], canonicalLabel: 'Washed', note: 'seed' },
    })
    expect(mutations.get(mapCurationTermsMutation)).not.toHaveBeenCalled()
  })

  it('unbound map autocomplete offers seed values and approved terms', async () => {
    const term = { ...ORGANOID, slot: 'tissue_modification', text: 'rinsed' }
    const dupe = { ...term, id: 't10', status: 'APPROVED', text: 'washed', canonicalLabel: 'washed' }
    const handWashed = { ...term, id: 't11', status: 'APPROVED', text: 'hand washed', canonicalLabel: 'Hand-washed' }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [dupe, handWashed] } } })) }
    const wrapper = await build(term, client)
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'map')
    await nextTick()
    const autocomplete = wrapper.findComponent({ name: 'ElAutocompleteMock' })
    const cb = vi.fn()
    await (autocomplete.vm.$attrs.fetchSuggestions as any)('wa', cb)
    expect(cb).toHaveBeenCalledWith([{ value: 'Washed' }, { value: 'Hand-washed', targetTermId: 't11' }])
    const row = (item: any) => mount({ render: () => (autocomplete.vm.$slots as any).default({ item }) }).text()
    expect(row({ value: 'Washed' })).toBe('Washed')
    expect(row({ value: 'Hand-washed', targetTermId: 't11' })).toBe('Hand-washed')
    expect(row({ value: 'MALDI', ontologyId: 'MS:1000075' })).toBe('MALDI MS:1000075')
  })

  it('shows a single Not found row when nothing matches and ignores selecting it', async () => {
    const term = { ...ORGANOID, slot: 'tissue_modification', text: 'rinsed' }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [] } } })) }
    const wrapper = await build(term, client)
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'map')
    await nextTick()
    const autocomplete = wrapper.findComponent({ name: 'ElAutocompleteMock' })
    const cb = vi.fn()
    await (autocomplete.vm.$attrs.fetchSuggestions as any)('zzzz', cb)
    expect(cb).toHaveBeenCalledWith([{ value: 'zzzz', notFound: true }])
    const row = (item: any) => mount({ render: () => (autocomplete.vm.$slots as any).default({ item }) }).text()
    expect(row({ value: 'zzzz', notFound: true })).toBe('Not found')
    ;(autocomplete.vm.$attrs.onSelect as any)({ value: 'zzzz', notFound: true })
    await nextTick()
    expect(wrapper.find('.curation-target').exists()).toBe(false)
    const apply = wrapper.findAll('button').find((b: any) => b.text() === 'Map & apply')
    expect(apply).toBeDefined()
    expect(apply!.attributes('disabled')).toBeDefined()
  })

  it('an approved row labelled like a seed is offered as the seed even when only its alias matched', async () => {
    const term = { ...ORGANOID, slot: 'tissue_modification', text: 'rinsed' }
    // "washing" matches the row through its alias; the seed "Washed" does not contain it
    const approved = {
      ...term,
      id: 't12',
      status: 'APPROVED',
      text: 'washed',
      canonicalLabel: 'Washed',
      aliases: ['washing'],
    }
    const client = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [approved] } } })) }
    const wrapper = await build(term, client)
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'map')
    await nextTick()
    const autocomplete = wrapper.findComponent({ name: 'ElAutocompleteMock' })
    for (const query of ['wash', 'washing']) {
      const cb = vi.fn()
      await (autocomplete.vm.$attrs.fetchSuggestions as any)(query, cb)
      expect(cb).toHaveBeenCalledWith([{ value: 'Washed' }])
    }
  })

  it('prefills map with the suggestion when one exists', async () => {
    const plain = await build(ORGANOID)
    expect(plain.findComponent(ElRadioGroup).props('modelValue')).toBe('approve')
    plain.unmount()

    const wrapper = await build(AP_MALDI)
    expect(wrapper.findComponent(ElRadioGroup).props('modelValue')).toBe('map')
    // ElAutocomplete is stubbed globally in setupTests; the stub keeps its props as attributes
    expect(wrapper.find('.curation-map').attributes('modelvalue')).toBe('AP-MALDI')
    expect(wrapper.find('.curation-target').text()).toContain('AP-MALDI MS:1000397')
    expect(primaryButton(wrapper).text()).toBe('Map & apply')
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(mapCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t2'], ontologyId: 'MS:1000397', note: null },
    })
    expect(wrapper.emitted('decided')).toEqual([[AP_MALDI]])
  })

  it('reject requires a reason', async () => {
    const wrapper = await build(ORGANOID)
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'reject')
    await nextTick()
    expect(wrapper.text()).toContain(
      "This dataset's next save of the same text will be refused with the reason below; other datasets are not " +
        'affected. The dataset keeps its current value.'
    )
    expect(primaryButton(wrapper).text()).toBe('Reject')
    expect(primaryButton(wrapper).attributes('disabled')).toBeDefined()
    noteInput(wrapper)!.vm.$emit('update:modelValue', '  ')
    await nextTick()
    expect(primaryButton(wrapper).attributes('disabled')).toBeDefined()
    noteInput(wrapper)!.vm.$emit('update:modelValue', 'Not a stabilisation method')
    await nextTick()
    expect(primaryButton(wrapper).attributes('disabled')).toBeUndefined()
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(rejectCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t1'], note: 'Not a stabilisation method' },
    })
    expect(wrapper.emitted('decided')).toHaveLength(1)
  })

  it('approve calls the mutation with label, aliases and note', async () => {
    const wrapper = await build(ORGANOID)
    const aliasInput = wrapper.findAllComponents(ElInput).find((c: any) => c.classes('curation-alias-input'))!
    for (const alias of ['organoids', '3D culture', 'organoids']) {
      aliasInput.vm.$emit('update:modelValue', alias)
      await nextTick()
      await aliasInput.find('input').trigger('keydown', { key: 'Enter' })
    }
    expect(wrapper.findAll('.curation-alias').map((t: any) => t.text())).toEqual(['organoids', '3D culture'])
    noteInput(wrapper)!.vm.$emit('update:modelValue', 'n')
    await nextTick()
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(approveCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t1'], canonicalLabel: 'Organoid', aliases: ['organoids', '3D culture'], note: 'n' },
    })
    expect(wrapper.emitted('decided')).toEqual([[ORGANOID]])
  })

  it('apply button disabled while running and shows progress', async () => {
    const wrapper = await build({
      ...ORGANOID,
      status: 'APPROVED',
      applyState: 'RUNNING',
      appliedCount: 0,
      decidedAt: new Date().toISOString(),
    })
    expect(wrapper.find('.curation-apply-state').text()).toBe('Applying…')
    expect(wrapper.text()).not.toContain('Applied')
    expect(primaryButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Retry')
  })

  it('polls the term every 2 s while running and stops afterwards and on unmount', async () => {
    vi.useFakeTimers()
    const wrapper = await build({ ...ORGANOID, applyState: 'RUNNING', decidedAt: new Date().toISOString() })
    vi.advanceTimersByTime(1999)
    expect(termRefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(termRefetch).toHaveBeenCalledTimes(1)
    termResult.value = { curationTerm: { ...ORGANOID, applyState: 'DONE', appliedCount: 1 } }
    await nextTick()
    vi.advanceTimersByTime(10000)
    expect(termRefetch).toHaveBeenCalledTimes(1)
    expect(primaryButton(wrapper).attributes('disabled')).toBeUndefined()

    termResult.value = { curationTerm: { ...ORGANOID, applyState: 'RUNNING', decidedAt: new Date().toISOString() } }
    await nextTick()
    wrapper.unmount()
    vi.advanceTimersByTime(10000)
    expect(termRefetch).toHaveBeenCalledTimes(1)
  })

  it('retry shown for a failed apply', async () => {
    const wrapper = await build({ ...ORGANOID, status: 'APPROVED', applyState: 'FAILED', appliedCount: 0 })
    expect(wrapper.find('.curation-apply-state').text()).toContain('apply failed')
    expect(wrapper.find('.curation-apply-state').text()).not.toContain('Applying')
    const retry = wrapper.findAll('button').find((b: any) => b.text() === 'Retry')
    await retry!.trigger('click')
    await flushPromises()
    expect(mutations.get(retryCurationApplyMutation)).toHaveBeenCalledWith({ id: 't1' })
    expect(termRefetch).toHaveBeenCalled()
  })

  it('retry shown for an apply running for more than 10 minutes', async () => {
    const stale = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const wrapper = await build({ ...ORGANOID, applyState: 'RUNNING', decidedAt: stale })
    expect(wrapper.findAll('button').some((b: any) => b.text() === 'Retry')).toBe(true)
  })

  it('map search uses ontology suggestions for bound slots and approved terms for unbound', async () => {
    const bound = {
      query: vi.fn(async () => ({
        data: { ontologyTermSuggestions: [{ curie: 'MS:1000075', label: 'MALDI', synonyms: [] }] },
      })),
    }
    const boundPanel = await build(AP_MALDI, bound)
    const boundSearch = boundPanel.findComponent({ name: 'ElAutocompleteMock' }).vm.$attrs.fetchSuggestions as any
    const boundCb = vi.fn()
    await boundSearch('mald', boundCb)
    expect(bound.query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: fetchOntologyTermSuggestionsQuery,
        variables: { slot: 'ionization_source', query: 'mald' },
      })
    )
    expect(boundCb).toHaveBeenCalledWith([{ value: 'MALDI', ontologyId: 'MS:1000075' }])
    boundPanel.unmount()

    const approved = {
      ...ORGANOID,
      id: 't9',
      status: 'APPROVED',
      text: 'Organoids',
      canonicalLabel: 'Organoid culture',
    }
    const unbound = { query: vi.fn(async () => ({ data: { curationTerms: { terms: [ORGANOID, approved] } } })) }
    const wrapper = await build(ORGANOID, unbound)
    wrapper.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 'map')
    await nextTick()
    expect(primaryButton(wrapper).attributes('disabled')).toBeDefined()
    const autocomplete = wrapper.findComponent({ name: 'ElAutocompleteMock' })
    const cb = vi.fn()
    await (autocomplete.vm.$attrs.fetchSuggestions as any)('organ', cb)
    expect(unbound.query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: curationTermsQuery,
        variables: { status: 'APPROVED', slot: 'sample_stabilisation', query: 'organ', limit: 8 },
      })
    )
    expect(cb).toHaveBeenCalledWith([{ value: 'Organoid culture', targetTermId: 't9' }])
    autocomplete.vm.$emit('select', { value: 'Organoid culture', targetTermId: 't9' })
    await nextTick()
    expect(wrapper.find('.curation-target').text()).toBe('Organoid culture')
    await primaryButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutations.get(mapCurationTermsMutation)).toHaveBeenCalledWith({
      input: { ids: ['t1'], targetTermId: 't9', note: null },
    })
  })

  it('skip emits next', async () => {
    const wrapper = await build(ORGANOID)
    const skip = wrapper.findAll('button').find((b: any) => b.text() === 'Skip')
    await skip!.trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
  })

  it('escape emits close', async () => {
    const wrapper = await build(ORGANOID)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.find('.curation-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
