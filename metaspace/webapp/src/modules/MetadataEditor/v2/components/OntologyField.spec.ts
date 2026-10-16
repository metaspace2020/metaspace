/* eslint-disable camelcase */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { OntologyField } from './OntologyField'
import { ElAutocomplete } from '../../../../lib/element-plus'
import { createValueResolver } from '../termResolver'

/** the editor API the component exposes (V2Form calls it to focus a field, optionally with a prefill) */
type FieldVm = { open: (preset?: string) => Promise<void> }

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
  // a field left mounted keeps its debounced lookup timer; once a later spec's clock moves, that lookup would open a
  // stale suggestion list in document.body
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    fetchTerms.mockClear()
  })

  it('renders a green chip for a controlled value with id and tick', () => {
    const w = mountField({
      value: { value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' },
    })
    const chip = w.find('.v2-chip')
    expect(chip.classes()).toContain('v2-chip--controlled')
    expect(chip.text()).toContain('Mus musculus')
    expect(chip.text()).toContain('NCBITaxon:10090')
    expect(chip.text()).toContain('✓')
  })

  it('renders an amber pending chip for free text', () => {
    const w = mountField({ value: { value_free_text: 'Intestine', curation_state: 'pending_curation' } })
    const chip = w.find('.v2-chip')
    expect(chip.classes()).toContain('v2-chip--pending')
    expect(chip.text()).toContain('Intestine')
    expect(chip.text()).toContain('pending curation')
  })

  it('shows an accepted badge for free_text_accepted values', () => {
    const w = mountField({ value: { value_free_text: 'spraying', curation_state: 'free_text_accepted' } })
    expect(w.find('.v2-chip').text()).toContain('accepted ✓')
  })

  const controlled = { value_ontology_id: 'X:1', value_label: 'x', curation_state: 'controlled' }

  it('clears on Backspace / Delete in the chip body and then shows the editor', async () => {
    const w = mountField({ value: controlled })
    await w.find('button.v2-chip__body').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('input')![0]).toEqual([{ curation_state: 'pending_curation' }])
    await w.setProps({ value: { curation_state: 'pending_curation' } })
    expect(w.findComponent(ElAutocomplete).exists()).toBe(true)
    const w2 = mountField({ value: controlled })
    await w2.find('button.v2-chip__body').trigger('keydown', { key: 'Delete' })
    expect(w2.emitted('input')).toEqual([[{ curation_state: 'pending_curation' }]])
  })

  it('opens the editor with the current text on a click, Enter or Space on the chip body', async () => {
    for (const act of [
      (b: ReturnType<ReturnType<typeof mountField>['find']>) => b.trigger('click'),
      (b: ReturnType<ReturnType<typeof mountField>['find']>) => b.trigger('keydown', { key: 'Enter' }),
      (b: ReturnType<ReturnType<typeof mountField>['find']>) => b.trigger('keydown', { key: ' ' }),
    ]) {
      const w = mountField({ value: controlled })
      await act(w.find('button.v2-chip__body'))
      await nextTick()
      expect(w.findComponent(ElAutocomplete).props('modelValue')).toBe('x')
      expect(w.emitted('input')).toBeUndefined()
    }
  })

  it('chip: the body and the clear × are sibling buttons inside a non-interactive pill', async () => {
    const w = mountField({ value: controlled })
    const pill = w.find('.v2-chip')
    // no nested interactive content (axe nested-interactive): the pill itself is neither a button nor focusable
    expect(pill.element.tagName).toBe('SPAN')
    expect(pill.attributes('role')).toBeUndefined()
    expect(pill.attributes('tabindex')).toBeUndefined()
    expect(w.findAll('[role="button"]')).toHaveLength(0)
    const body = pill.find('button.v2-chip__body')
    const clear = pill.find('button[aria-label="Clear value"]')
    expect(body.attributes('type')).toBe('button')
    expect(body.attributes('aria-label')).toBe('x, press Enter to change, Backspace to clear')
    expect(body.text()).toContain('X:1')
    expect(body.find('button').exists()).toBe(false)
    expect(clear.classes()).toContain('v2-chip__clear')
    expect(clear.attributes('type')).toBe('button')
    expect(clear.text()).toBe('×')
    // the × comes last in the pill, right after the body (which holds the id / state text)
    expect(Array.from(pill.element.children)).toEqual([body.element, clear.element])
    // Enter on the × activates the × only; it never opens the editor
    await clear.trigger('keydown', { key: 'Enter' })
    expect(w.findComponent(ElAutocomplete).exists()).toBe(false)
    await clear.trigger('click')
    expect(w.emitted('input')).toEqual([[{ curation_state: 'pending_curation' }]])
    await nextTick()
    expect(w.findComponent(ElAutocomplete).props('modelValue')).toBe('')
  })

  it('a disabled chip has a disabled body and no clear ×', () => {
    const w = mountField({ value: controlled, disabled: true })
    expect(w.find('button.v2-chip__body').attributes('disabled')).toBeDefined()
    expect(w.find('button[aria-label="Clear value"]').exists()).toBe(false)
  })

  describe('opening a chip and blurring', () => {
    // ElAutocomplete's blur handler asks the real tooltip whether focus moved into the list
    const mountField = mountWithList
    afterEach(() => {
      document.body.innerHTML = ''
    })

    /** clicks the chip body (opens the editor with the current text), optionally types, then blurs the input */
    const openAndBlur = async (w: ReturnType<typeof mountField>, typed?: string) => {
      await w.find('button.v2-chip__body').trigger('click')
      await nextTick()
      if (typed !== undefined) await w.find('input').setValue(typed)
      w.find('input').element.dispatchEvent(new FocusEvent('blur'))
      // ElAutocomplete emits blur from a timer
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
    }

    it('emits nothing when the text is unchanged and the value is not pending', async () => {
      for (const [value, knownValues] of [
        [{ value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' }, []],
        // a controlled value without id whose text is also a curated value is not downgraded to accepted
        [{ value_free_text: 'Tissue', curation_state: 'controlled' }, ['Tissue']],
        // an accepted value in another spelling than the curated one is not re-canonicalised
        [{ value_free_text: 'oct embedded', curation_state: 'free_text_accepted' }, ['OCT embedded']],
        [{ value_free_text: 'spraying', curation_state: 'free_text_accepted' }, []],
      ] as const) {
        const w = mountField({ value, knownValues: [...knownValues] })
        await openAndBlur(w)
        // the value is part of the compared object so a failure names the case
        expect({ value, emitted: w.emitted('input') }).toEqual({ value, emitted: undefined })
        expect(w.findComponent(ElAutocomplete).exists()).toBe(false)
      }
    })

    it('emits nothing when only the case of the text changed and the value is not pending', async () => {
      const w = mountField({
        value: { value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' },
      })
      await openAndBlur(w, '  MUS musculus ')
      expect(w.emitted('input')).toBeUndefined()
    })

    it('still commits a changed text, and still promotes a pending value equal to a curated one', async () => {
      const w = mountField({ value: { value_free_text: 'spraying', curation_state: 'free_text_accepted' } })
      await openAndBlur(w, 'airbrush')
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'airbrush', curation_state: 'pending_curation' }]])
      const pending = mountField({
        slot: undefined,
        knownValues: ['Fresh frozen'],
        value: { value_free_text: 'fresh frozen', curation_state: 'pending_curation' },
      })
      await openAndBlur(pending)
      expect(pending.emitted('input')).toEqual([
        [{ value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' }],
      ])
    })
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
    ac.vm.$emit('blur', new FocusEvent('blur'))
    await nextTick()
    expect(w.emitted('input')).toHaveLength(1)

    ac.vm.$emit('input', 'Rattus')
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('input')![1]).toEqual([{ value_free_text: 'Rattus', curation_state: 'pending_curation' }])
    // blur after Enter must not commit a second time
    ac.vm.$emit('blur', new FocusEvent('blur'))
    await nextTick()
    expect(w.emitted('input')).toHaveLength(2)
  })

  it('Enter on text equal to a shown term label (any case) stores the controlled term, as a click would', async () => {
    const w = mountField()
    const ac = w.findComponent(ElAutocomplete)
    await ac.props('fetchSuggestions')('mouse', vi.fn())
    ac.vm.$emit('input', ' mus MUSCULUS')
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('input')).toEqual([
      [{ value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' }],
    ])
    // the row text as shown ("label (curie)") is recognised too
    const w2 = mountField()
    await w2.findComponent(ElAutocomplete).props('fetchSuggestions')('mouse', vi.fn())
    w2.findComponent(ElAutocomplete).vm.$emit('input', 'Mus musculus (NCBITaxon:10090)')
    await w2.find('input').trigger('keydown', { key: 'Enter' })
    expect(w2.emitted('input')).toEqual([
      [{ value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' }],
    ])
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
    ;(w.vm as unknown as FieldVm).open('Orbitrap')
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

  describe('driven through real typing, Enter and clicks', () => {
    const none = vi.fn(async () => [])
    // setupTests pins Date.now, which stops lodash's debounce (ElAutocomplete's 300 ms lookup delay) from ever firing;
    // fake timers give the debounce a clock that moves
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
      document.body.innerHTML = ''
      none.mockClear()
    })
    /** ElAutocomplete runs the lookup 300 ms after the last keystroke */
    const waitForLookup = async () => {
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
    }
    const rows = () => Array.from(document.body.querySelectorAll<HTMLElement>('.v2-ac-popper li'))
    /** a real blur of the input; ElAutocomplete emits it from a timer */
    const blur = async (w: ReturnType<typeof mountWithList>) => {
      w.find('input').element.dispatchEvent(new FocusEvent('blur'))
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
    }
    const pending = (text: string) => [{ value_free_text: text, curation_state: 'pending_curation' }]
    const mouseTerm = [
      { value_ontology_id: 'NCBITaxon:10090', value_label: 'Mus musculus', curation_state: 'controlled' },
    ]

    it('typing unknown text and pressing Enter commits it as pending curation, once', async () => {
      const w = mountWithList({ fetchTerms: none })
      await w.find('input').setValue('Rattus norvegicus')
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([pending('Rattus norvegicus')])
      await waitForLookup()
      await blur(w)
      expect(w.emitted('input')).toHaveLength(1)
    })

    it('typing a term label, waiting for the list, then Enter stores the controlled term', async () => {
      const w = mountWithList()
      await w.find('input').setValue('mus musculus')
      await waitForLookup()
      expect(fetchTerms).toHaveBeenCalledWith('organism', 'mus musculus')
      expect(rows().map((li) => li.textContent)).toEqual(['Mus musculus (NCBITaxon:10090)'])
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([mouseTerm])
    })

    it('ArrowDown + Enter selects the highlighted suggestion, once', async () => {
      const w = mountWithList()
      await w.find('input').setValue('mouse')
      await waitForLookup()
      await w.find('input').trigger('keydown', { key: 'ArrowDown' })
      await w.find('input').trigger('keydown', { key: 'Enter' })
      await nextTick()
      expect(w.findComponent(ElAutocomplete).emitted('select')).toHaveLength(1)
      expect(w.emitted('input')).toEqual([mouseTerm])
    })

    it('clicking a suggestion row stores the controlled term', async () => {
      const w = mountWithList()
      await w.find('input').setValue('mouse')
      await waitForLookup()
      const row = rows().find((li) => li.textContent === 'Mus musculus (NCBITaxon:10090)')
      expect(row).toBeDefined()
      row!.click()
      await nextTick()
      expect(w.emitted('input')).toEqual([mouseTerm])
      await blur(w)
      expect(w.emitted('input')).toHaveLength(1)
    })

    it('clicking the "No match" row commits the typed text as pending curation', async () => {
      const w = mountWithList({ fetchTerms: none })
      await w.find('input').setValue('xyzzy')
      await waitForLookup()
      expect(none).toHaveBeenCalledWith('organism', 'xyzzy')
      expect(rows()).toHaveLength(1)
      expect(rows()[0].textContent).toBe('No match — Add “xyzzy” (pending curation)')
      rows()[0].click()
      await nextTick()
      expect(w.emitted('input')).toEqual([pending('xyzzy')])
    })

    it('a value typed in another case shows that value and no "No match" row; Enter stores it accepted', async () => {
      const values = vi.fn(async (q: string) =>
        ['Tissue', 'Cell culture'].filter((v) => v.toLowerCase().includes(q.toLowerCase())).map((label) => ({ label }))
      )
      const w = mountWithList({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      await w.find('input').setValue('tissue')
      await waitForLookup()
      expect(values).toHaveBeenCalledWith('tissue')
      expect(rows().map((li) => li.textContent)).toEqual(['Tissue'])
      expect(document.body.querySelector('.v2-ac-empty')).toBeNull()
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Tissue', curation_state: 'free_text_accepted' }]])
    })

    describe('a failing resolver', () => {
      let errorSpy: ReturnType<typeof vi.spyOn>
      let warnSpy: ReturnType<typeof vi.spyOn>
      const rejections: unknown[] = []
      const onRejection = (reason: unknown) => rejections.push(reason)
      beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error')
        warnSpy = vi.spyOn(console, 'warn')
        rejections.length = 0
        process.on('unhandledRejection', onRejection)
      })
      afterEach(() => {
        process.off('unhandledRejection', onRejection)
        expect(rejections).toEqual([])
        expect(errorSpy).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalled()
        errorSpy.mockRestore()
        warnSpy.mockRestore()
      })

      /** types, waits for the lookup and returns the shown rows' text */
      const typeAndList = async (w: ReturnType<typeof mountWithList>, text: string) => {
        await w.find('input').setValue(text)
        await waitForLookup()
        return rows().map((li) => li.textContent)
      }

      it('a value lookup whose fetch rejects still shows the "No match" row, which commits', async () => {
        const down = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
        const w = mountWithList({ slot: undefined, fetchValues: down })
        expect(await typeAndList(w, 'Organoid')).toEqual(['No match — Add “Organoid” (pending curation)'])
        expect(down).toHaveBeenCalledWith('Organoid')
        rows()[0].click()
        await nextTick()
        expect(w.emitted('input')).toEqual([pending('Organoid')])
      })

      it('the real value resolver falls back to the curated list when the network is down', async () => {
        const query = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
        const valueResolver = createValueResolver({ query })
        const fetchValues = (q: string) => valueResolver('sample_stabilisation', q)
        const w = mountWithList({ slot: undefined, fetchValues, minQueryLength: 1 })
        // a curated value is still offered; unknown text gets the "No match" row
        expect(await typeAndList(w, 'oct')).toEqual(['OCT embedded'])
        expect(await typeAndList(w, 'zzqx')).toEqual(['No match — Add “zzqx” (pending curation)'])
        expect(query).toHaveBeenCalledTimes(2)
        await w.find('input').trigger('keydown', { key: 'Enter' })
        expect(w.emitted('input')).toEqual([pending('zzqx')])
      })

      it('a term lookup whose fetch rejects still shows the "No match" row', async () => {
        const down = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
        const w = mountWithList({ fetchTerms: down })
        expect(await typeAndList(w, 'Rattus')).toEqual(['No match — Add “Rattus” (pending curation)'])
        await w.find('input').trigger('keydown', { key: 'Enter' })
        expect(w.emitted('input')).toEqual([pending('Rattus')])
      })
    })
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

    it('suggests plain values from minQueryLength (1), never on focus, and never calls the term lookup', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, minQueryLength: 1 })
      const ac = w.findComponent(ElAutocomplete)
      expect(ac.props('triggerOnFocus')).toBe(false)
      const cb = vi.fn()
      await ac.props('fetchSuggestions')('', cb)
      expect(cb).toHaveBeenLastCalledWith([])
      expect(values).not.toHaveBeenCalled()
      await ac.props('fetchSuggestions')('f', cb)
      expect(values).toHaveBeenLastCalledWith('f')
      expect(cb).toHaveBeenLastCalledWith([{ value: 'Fresh frozen' }, { value: 'Flash frozen (liquid nitrogen)' }])
      expect(fetchTerms).not.toHaveBeenCalled()
    })

    it('without minQueryLength a value field waits for 3 characters; 0 never fetches an empty query', async () => {
      const w = mountField({ slot: undefined, fetchValues: values })
      const cb = vi.fn()
      for (const q of ['f', 'fr']) {
        await w.findComponent(ElAutocomplete).props('fetchSuggestions')(q, cb)
        expect(cb).toHaveBeenLastCalledWith([])
      }
      expect(values).not.toHaveBeenCalled()
      const zero = mountField({ slot: undefined, fetchValues: values, minQueryLength: 0 })
      await zero.findComponent(ElAutocomplete).props('fetchSuggestions')('', cb)
      expect(cb).toHaveBeenLastCalledWith([])
      expect(values).not.toHaveBeenCalled()
    })

    it('selecting a value stores it as accepted free text, once', async () => {
      const w = mountField({ slot: undefined, fetchValues: values })
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
      const w = mountField({ slot: undefined, fetchValues: values })
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
      const w = mountField({ slot: undefined, fetchValues: values })
      const ac = w.findComponent(ElAutocomplete)
      await ac.props('fetchSuggestions')('fresh', vi.fn())
      ac.vm.$emit('input', 'fresh FROZEN')
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' }]])
    })

    it('Enter on text equal to a curated value (any case, padded) stores it accepted before any lookup', async () => {
      const w = mountField({
        slot: undefined,
        fetchValues: values,
        knownValues: ['Fresh frozen', 'OCT embedded'],
      })
      const ac = w.findComponent(ElAutocomplete)
      ac.vm.$emit('input', '  oct EMBEDDED ')
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(values).not.toHaveBeenCalled()
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'OCT embedded', curation_state: 'free_text_accepted' }]])
    })

    it('Enter on unknown text stays pending curation even with a curated list and shown values', async () => {
      const w = mountField({ slot: undefined, fetchValues: values, knownValues: ['Fresh frozen'] })
      const ac = w.findComponent(ElAutocomplete)
      const cb = vi.fn()
      await ac.props('fetchSuggestions')('Fresh frozen x', cb)
      expect(cb).toHaveBeenLastCalledWith([{ value: 'Fresh frozen x', empty: true }])
      ac.vm.$emit('input', 'Fresh frozen x')
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen x', curation_state: 'pending_curation' }]])
    })

    it('Enter on a known value whose text equals the pending value promotes it to accepted', async () => {
      const w = mountField({
        slot: undefined,
        fetchValues: values,
        knownValues: ['Fresh frozen'],
        value: { value_free_text: 'Fresh frozen', curation_state: 'pending_curation' },
      })
      ;(w.vm as unknown as FieldVm).open()
      await nextTick()
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' }]])
      // the same text that is already accepted commits nothing
      const same = mountField({
        slot: undefined,
        knownValues: ['Fresh frozen'],
        value: { value_free_text: 'Fresh frozen', curation_state: 'free_text_accepted' },
      })
      ;(same.vm as unknown as FieldVm).open()
      await nextTick()
      await same.find('input').trigger('keydown', { key: 'Enter' })
      expect(same.emitted('input')).toBeUndefined()
    })

    it('open() drops the suggestions of the previous query, so Enter cannot match them', async () => {
      const w = mountField({ slot: undefined, fetchValues: values })
      const ac = w.findComponent(ElAutocomplete)
      await ac.props('fetchSuggestions')('fresh', vi.fn())
      ;(w.vm as unknown as FieldVm).open('Fresh frozen')
      await nextTick()
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'pending_curation' }]])
    })

    it('a lookup still in flight when open() is called does not repopulate the known suggestions', async () => {
      let resolve: (v: { label: string }[]) => void = () => undefined
      const slow = vi.fn(() => new Promise<{ label: string }[]>((r) => (resolve = r)))
      const w = mountField({ slot: undefined, fetchValues: slow })
      const cb = vi.fn()
      const pending = w.findComponent(ElAutocomplete).props('fetchSuggestions')('fresh', cb)
      ;(w.vm as unknown as FieldVm).open('Fresh frozen')
      await nextTick()
      resolve([{ label: 'Fresh frozen' }])
      await pending
      await w.find('input').trigger('keydown', { key: 'Enter' })
      expect(w.emitted('input')).toEqual([[{ value_free_text: 'Fresh frozen', curation_state: 'pending_curation' }]])
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
