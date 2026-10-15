/* eslint-disable camelcase */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { OntologyField } from './OntologyField'
import { ElAutocomplete } from '../../../../lib/element-plus'

const term = { curie: 'NCBITaxon:10090', label: 'Mus musculus', synonyms: ['mouse'] }
const fetchTerms = vi.fn(async (_slot: string, q: string) => (q.length >= 3 ? [term] : []))

const mountField = (props: any = {}) =>
  mount(OntologyField, {
    props: { value: null, slot: 'organism', fetchTerms, placeholder: 'Search…', ...props },
    // setupTests.ts stubs el-autocomplete globally; these specs need the real component
    global: { stubs: { 'el-autocomplete': false, ElAutocomplete: false } },
  })

/** like mountField, but with the real ElTooltip so the suggestion list (teleported to body) renders */
const mountWithList = (props: any = {}) =>
  mount(OntologyField, {
    props: { value: null, slot: 'organism', fetchTerms, placeholder: 'Search…', ...props },
    attachTo: document.body,
    global: { stubs: { 'el-autocomplete': false, ElAutocomplete: false, 'el-tooltip': false, ElTooltip: false } },
  })

describe('OntologyField', () => {
  beforeEach(() => {
    fetchTerms.mockClear()
  })

  it('renders a green chip for a controlled value with id and tick', () => {
    const w = mountField({
      value: { value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' },
    })
    const chip = w.find('[role="button"].v2-chip')
    expect(chip.classes()).toContain('v2-chip--controlled')
    expect(chip.text()).toContain('Mus musculus')
    expect(chip.text()).toContain('NCBITaxon:10090')
    expect(chip.text()).toContain('✓')
  })

  it('renders an amber pending chip for free text and a suggestion with actions', async () => {
    const w = mountField({
      value: { value_free_text: 'Intestine', curation_state: 'pending_curation' },
      report: { state: 'review', suggestion: { curie: 'UBERON:0000160', label: 'intestine', synonyms: [] } },
    })
    const chip = w.find('.v2-chip')
    expect(chip.classes()).toContain('v2-chip--pending')
    expect(chip.text()).toContain('Intestine')
    expect(chip.text()).toContain('UBERON:0000160')
    expect(chip.text()).toContain('?')
    await w.find('button.v2-chip__use').trigger('click')
    expect(w.emitted('applySuggestion')).toHaveLength(1)
    await w.find('button.v2-chip__keep').trigger('click')
    expect(w.emitted('acknowledge')).toHaveLength(1)
  })

  it('shows "pending curation" without suggestion actions once acknowledged', () => {
    const w = mountField({
      value: { value_free_text: 'Flash', curation_state: 'pending_curation' },
      report: { state: 'review' },
      acknowledged: true,
    })
    expect(w.find('.v2-chip').text()).toContain('pending curation')
    expect(w.find('button.v2-chip__keep').exists()).toBe(false)
  })

  it('offers "Keep as typed" for review state without a suggestion until acknowledged', async () => {
    const value = { value_free_text: 'spraying', curation_state: 'free_text_accepted' }
    const w = mountField({ value, report: { state: 'review' } })
    expect(w.find('button.v2-chip__use').exists()).toBe(false)
    await w.find('button.v2-chip__keep').trigger('click')
    expect(w.emitted('acknowledge')).toHaveLength(1)
    await w.setProps({ acknowledged: true })
    expect(w.find('button.v2-chip__keep').exists()).toBe(false)
  })

  it('shows an accepted badge for free_text_accepted values', () => {
    const w = mountField({ value: { value_free_text: 'spraying', curation_state: 'free_text_accepted' } })
    expect(w.find('.v2-chip').text()).toContain('accepted ✓')
  })

  it('opens the editor on chip activation and clears on Backspace', async () => {
    const w = mountField({ value: { value_ontology_id: 'X:1', value_label: 'x', curation_state: 'controlled' } })
    await w.find('.v2-chip').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('input')![0]).toEqual([{ curation_state: 'pending_curation' }])
    await w.setProps({ value: { curation_state: 'pending_curation' } })
    expect(w.findComponent(ElAutocomplete).exists()).toBe(true)
  })

  it('renders the clear × inside the pill; its keys stay out of the chip and a click clears', async () => {
    const w = mountField({ value: { value_ontology_id: 'X:1', value_label: 'x', curation_state: 'controlled' } })
    const clear = w.find('.v2-chip .v2-chip__clear')
    expect(clear.exists()).toBe(true)
    expect(clear.attributes('aria-label')).toBe('Clear value')
    // after the id / state text
    const children = Array.from(w.find('.v2-chip').element.children)
    expect(children[children.length - 1]).toBe(clear.element)
    // keys on the × do not reach the chip (Enter there would open the editor instead of clearing)
    await clear.trigger('keydown', { key: 'Enter' })
    expect(w.findComponent(ElAutocomplete).exists()).toBe(false)
    await clear.trigger('click')
    expect(w.emitted('input')).toEqual([[{ curation_state: 'pending_curation' }]])
  })

  it('emits a controlled value on select and pending free text on Enter', async () => {
    const w = mountField()
    const ac = w.findComponent(ElAutocomplete)
    const cb = vi.fn()
    await ac.props('fetchSuggestions')('mu', cb)
    expect(fetchTerms).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith([])
    await ac.props('fetchSuggestions')('mus', cb)
    expect(fetchTerms).toHaveBeenCalledWith('organism', 'mus')
    expect(cb).toHaveBeenLastCalledWith([{ value: 'Mus musculus (NCBITaxon:10090)', term }])

    ac.vm.$emit('select', { value: 'Mus musculus (NCBITaxon:10090)', term })
    expect(w.emitted('input')![0]).toEqual([
      { value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' },
    ])

    // blur after select must not overwrite the selection with the stale draft
    ac.vm.$emit('blur')
    await nextTick()
    expect(w.emitted('input')).toHaveLength(1)

    ac.vm.$emit('input', 'Rattus')
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('input')![1]).toEqual([{ value_free_text: 'Rattus', curation_state: 'pending_curation' }])
    // blur after Enter must not commit a second time
    ac.vm.$emit('blur')
    await nextTick()
    expect(w.emitted('input')).toHaveLength(2)
  })

  it('unbound slots never fetch; from 3 chars they offer the pending-curation row, which commits', async () => {
    const w = mountField({ slot: undefined })
    const ac = w.findComponent(ElAutocomplete)
    const cb = vi.fn()
    await ac.props('fetchSuggestions')('C5', cb)
    expect(cb).toHaveBeenLastCalledWith([])
    await ac.props('fetchSuggestions')('  C57BL/6J ', cb)
    expect(cb).toHaveBeenLastCalledWith([{ value: 'C57BL/6J', empty: true }])
    expect(fetchTerms).not.toHaveBeenCalled()

    // ElAutocomplete emits `input` with the row's value before `select`
    ac.vm.$emit('input', 'C57BL/6J')
    ac.vm.$emit('select', { value: 'C57BL/6J', empty: true })
    await nextTick()
    // the blur that follows commits nothing more
    ac.vm.$emit('blur', new FocusEvent('blur'))
    await nextTick()
    expect(w.emitted('input')).toEqual([[{ value_free_text: 'C57BL/6J', curation_state: 'pending_curation' }]])
  })

  it('open(prefill) switches to the editor with the prefill text', async () => {
    const w = mountField({ value: { value_ontology_id: 'X:1', value_label: 'x', curation_state: 'controlled' } })
    ;(w.vm as any).open('Orbitrap')
    await nextTick()
    expect(w.findComponent(ElAutocomplete).props('modelValue')).toBe('Orbitrap')
  })

  it('shows a "no matching terms" placeholder when a long query matches nothing (or the lookup fails)', async () => {
    const none = vi.fn(async () => [])
    const w = mountField({ fetchTerms: none })
    const ac = w.findComponent(ElAutocomplete)
    const cb = vi.fn()
    await ac.props('fetchSuggestions')('xyzzy', cb)
    expect(cb).toHaveBeenLastCalledWith([{ value: 'xyzzy', empty: true }])
    await ac.props('fetchSuggestions')('xy', cb)
    expect(cb).toHaveBeenLastCalledWith([])
    const failing = mountField({ fetchTerms: vi.fn(async () => Promise.reject(new Error('down'))) })
    await failing.findComponent(ElAutocomplete).props('fetchSuggestions')('xyzzy', cb)
    expect(cb).toHaveBeenLastCalledWith([{ value: 'xyzzy', empty: true }])

    // the scoped slot renders the placeholder text
    const slot = (ac.vm as any).$slots.default
    const rendered = mount({ render: () => slot({ item: { value: 'xyzzy', empty: true } }) })
    expect(rendered.text()).toBe('No match — Add “xyzzy” (pending curation)')
    expect(rendered.find('.v2-ac-empty').exists()).toBe(true)
    expect(rendered.find('.v2-ac-empty__action').text()).toBe('Add “xyzzy”')
  })

  it('selecting the placeholder commits the typed text as pending curation, once', async () => {
    const w = mountField({ fetchTerms: vi.fn(async () => []) })
    const ac = w.findComponent(ElAutocomplete)
    ac.vm.$emit('input', 'xyzzy')
    await nextTick()
    ac.vm.$emit('select', { value: 'xyzzy', empty: true })
    await nextTick()
    ac.vm.$emit('blur', new FocusEvent('blur'))
    await nextTick()
    expect(w.emitted('input')).toEqual([[{ value_free_text: 'xyzzy', curation_state: 'pending_curation' }]])
  })

  it('Enter in the input still commits the free text without touching the list', async () => {
    const w = mountField({ fetchTerms: vi.fn(async () => []) })
    const ac = w.findComponent(ElAutocomplete)
    ac.vm.$emit('input', 'xyzzy')
    await nextTick()
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('input')).toEqual([[{ value_free_text: 'xyzzy', curation_state: 'pending_curation' }]])
  })

  it('"No match" row: Enter commits the typed text; ArrowDown+Enter and a click select the row', async () => {
    const none = vi.fn(async () => [])
    // ElAutocomplete's exposed refs (highlightedIndex, activated, suggestions) live on the instance, not the vm proxy
    const typeAndFetch = async (w: ReturnType<typeof mountField>) => {
      const ac = w.findComponent(ElAutocomplete)
      const exposed = (ac.vm as any).$.exposed
      await w.find('input').setValue('xyzzy')
      // run the (debounced) lookup now and show its result: the list holds only the placeholder row
      await ac.props('fetchSuggestions')('xyzzy', (items: unknown[]) => (exposed.suggestions.value = items))
      exposed.activated.value = true
      await nextTick()
      expect(none).toHaveBeenLastCalledWith('organism', 'xyzzy')
      expect(exposed.suggestions.value).toEqual([{ value: 'xyzzy', empty: true }])
      return exposed
    }

    // ArrowDown highlights the placeholder (jsdom has no popper layout for highlight(), so set the index it would
    // set); Enter then selects it through ElAutocomplete, which commits the typed text exactly once
    const w = mountField({ fetchTerms: none })
    const exposed = await typeAndFetch(w)
    exposed.highlightedIndex.value = 0
    await w.find('input').trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(w.findComponent(ElAutocomplete).emitted('select')).toEqual([[{ value: 'xyzzy', empty: true }]])
    expect(w.findComponent(ElAutocomplete).props('modelValue')).toBe('xyzzy')
    expect(w.emitted('input')).toEqual([[{ value_free_text: 'xyzzy', curation_state: 'pending_curation' }]])

    // plain Enter with the placeholder visible (nothing highlighted) commits the free text
    const w2 = mountField({ fetchTerms: none })
    const exposed2 = await typeAndFetch(w2)
    expect(exposed2.highlightedIndex.value).toBe(-1)
    await w2.find('input').trigger('keydown', { key: 'Enter' })
    expect(w2.findComponent(ElAutocomplete).emitted('select')).toBeUndefined()
    expect(w2.emitted('input')).toEqual([[{ value_free_text: 'xyzzy', curation_state: 'pending_curation' }]])

    // clicking the rendered row selects it and commits the typed text
    const w3 = mountWithList({ fetchTerms: none })
    await typeAndFetch(w3)
    const row = Array.from(document.body.querySelectorAll('.v2-ac-popper li')).find((li) =>
      li.querySelector('.v2-ac-empty')
    ) as HTMLElement | undefined
    expect(row).toBeDefined()
    row!.click()
    await nextTick()
    expect(w3.emitted('input')).toEqual([[{ value_free_text: 'xyzzy', curation_state: 'pending_curation' }]])
    w3.unmount()
  })

  it('a real suggestion list still renders terms and selecting one stores the controlled term', async () => {
    const w = mountWithList()
    const ac = w.findComponent(ElAutocomplete)
    const exposed = (ac.vm as any).$.exposed
    await w.find('input').setValue('mouse')
    await ac.props('fetchSuggestions')('mouse', (items: unknown[]) => (exposed.suggestions.value = items))
    exposed.activated.value = true
    await nextTick()
    const rows = Array.from(document.body.querySelectorAll('.v2-ac-popper li')) as HTMLElement[]
    const termRow = rows.find((li) => li.textContent === 'Mus musculus (NCBITaxon:10090)')
    expect(termRow).toBeDefined()
    expect(termRow!.querySelector('.v2-ac-empty')).toBeNull()
    termRow!.click()
    await nextTick()
    expect(w.emitted('input')).toEqual([
      [{ value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' }],
    ])
    w.unmount()
  })

  describe('with a value resolver (fields without ontology)', () => {
    const values = vi.fn(async (q: string) =>
      ['Fresh frozen', 'Flash frozen (liquid nitrogen)']
        .filter((v) => v.toLowerCase().includes(q.toLowerCase()))
        .map((label) => ({ label }))
    )
    beforeEach(() => {
      values.mockClear()
    })

    it('suggests plain values from minQueryLength and never calls the term lookup', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      const ac = w.findComponent(ElAutocomplete)
      const cb = vi.fn()
      await ac.props('fetchSuggestions')('', cb)
      expect(cb).toHaveBeenLastCalledWith([])
      expect(values).not.toHaveBeenCalled()
      await ac.props('fetchSuggestions')('f', cb)
      expect(values).toHaveBeenLastCalledWith('f')
      expect(cb).toHaveBeenLastCalledWith([{ value: 'Fresh frozen' }, { value: 'Flash frozen (liquid nitrogen)' }])
      expect(fetchTerms).not.toHaveBeenCalled()
    })

    it('selecting a value stores it as accepted free text, once', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      const ac = w.findComponent(ElAutocomplete)
      ac.vm.$emit('input', 'Fresh frozen')
      ac.vm.$emit('select', { value: 'Fresh frozen' })
      await nextTick()
      ac.vm.$emit('blur', new FocusEvent('blur'))
      await nextTick()
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' }]])
      await w.setProps({ value: { value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' } })
      expect(w.find('.v2-chip').classes()).toContain('v2-chip--accepted')
      expect(w.find('.v2-chip').text()).toContain('accepted ✓')
    })

    it('no match offers the "No match" row, which commits pending curation', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      const ac = w.findComponent(ElAutocomplete)
      const cb = vi.fn()
      await ac.props('fetchSuggestions')('xyz', cb)
      expect(cb).toHaveBeenLastCalledWith([{ value: 'xyz', empty: true }])
      ac.vm.$emit('input', 'xyz')
      ac.vm.$emit('select', { value: 'xyz', empty: true })
      await nextTick()
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'xyz', curation_state: 'pending_curation' }]])
    })

    it('a failing value lookup still offers the "No match" row', async () => {
      const w = mountField({ slot: undefined, fetchValues: vi.fn(async () => Promise.reject(new Error('down'))) })
      const cb = vi.fn()
      await w.findComponent(ElAutocomplete).props('fetchSuggestions')('abcd', cb)
      expect(cb).toHaveBeenLastCalledWith([{ value: 'abcd', empty: true }])
    })

    it('Enter on text equal to a shown value (any case) stores the value as accepted', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      const ac = w.findComponent(ElAutocomplete)
      await ac.props('fetchSuggestions')('fresh', vi.fn())
      ac.vm.$emit('input', 'fresh FROZEN')
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' }]])
    })

    it('minQueryLength 0 + openOnFocus lists every value for an empty query, without the "No match" row', async () => {
      const all = vi.fn(async () => [{ label: 'Tissue' }, { label: 'Plant' }])
      const w = mountField({ slot: undefined, fetchValues: all, minQueryLength: 0, openOnFocus: true })
      const ac = w.findComponent(ElAutocomplete)
      expect(ac.props('triggerOnFocus')).toBe(true)
      const cb = vi.fn()
      await ac.props('fetchSuggestions')('', cb)
      expect(cb).toHaveBeenLastCalledWith([{ value: 'Tissue' }, { value: 'Plant' }])
      const none = mountField({ slot: undefined, fetchValues: vi.fn(async () => []), minQueryLength: 0 })
      await none.findComponent(ElAutocomplete).props('fetchSuggestions')('', cb)
      expect(cb).toHaveBeenLastCalledWith([])
    })

    it('a controlled value without an ontology id renders a green chip with no id text', () => {
      const w = mountField({ slot: undefined, value: { value_free_text: 'Tissue', curation_state: 'controlled' } })
      const chip = w.find('.v2-chip')
      expect(chip.classes()).toContain('v2-chip--controlled')
      expect(chip.find('.v2-chip__id').exists()).toBe(false)
      expect(chip.text()).toContain('Tissue')
      expect(chip.text()).toContain('✓')
    })
  })
})
