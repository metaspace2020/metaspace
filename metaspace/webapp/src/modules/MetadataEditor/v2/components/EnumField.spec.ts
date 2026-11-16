import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { ElSelect } from '../../../../lib/element-plus'
import { EnumField } from './EnumField'

const options = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
]

describe('EnumField', () => {
  const build = () =>
    mount(EnumField, {
      props: { value: null, options },
      global: { stubs: { 'el-select': false, 'el-option': false } },
    })

  it('renders the options', () => {
    const w = build()
    const select = w.findComponent(ElSelect)
    expect(select.exists()).toBe(true)
    // the dropdown renders lazily into a teleport, so inspect the options handed to the select slot
    const rendered = (select.vm.$slots.default!() as any[])
      .flatMap((v) => v.children ?? [v])
      .map((v: any) => v.props.label)
    expect(rendered).toEqual(['Female', 'Male'])
  })

  it('emits the chosen value and null on clear', () => {
    const w = build()
    const select = w.findComponent(ElSelect)
    select.vm.$emit('update:modelValue', 'male')
    select.vm.$emit('update:modelValue', '')
    expect(w.emitted('input')).toEqual([['male'], [null]])
  })

  describe('allowCreate', () => {
    const sampleTypes = [
      { value: 'tissue', label: 'Tissue' },
      { value: 'cell_culture', label: 'Cell culture' },
    ]
    const buildCreate = () =>
      mount(EnumField, {
        props: { value: null, options: sampleTypes, allowCreate: true },
        global: { stubs: { 'el-select': false, 'el-option': false } },
      })
    const renderedOptions = (w: ReturnType<typeof buildCreate>) =>
      (w.findComponent(ElSelect).vm.$slots.default!() as any[]).flatMap((v) => v.children ?? [v]).filter(Boolean)

    it('filters the options by substring of the typed text, without a create row while something matches', async () => {
      const w = buildCreate()
      const select = w.findComponent(ElSelect)
      expect(select.props('filterable')).toBe(true)
      expect(select.props('allowCreate')).toBe(false)
      select.props('filterMethod')('CULT')
      await nextTick()
      expect(renderedOptions(w).map((v: any) => v.props.label)).toEqual(['Cell culture'])
    })

    it('offers a "No match — Add …" row for unmatched text, whose value is the typed text', async () => {
      const w = buildCreate()
      const select = w.findComponent(ElSelect)
      select.props('filterMethod')(' Organoid ')
      await nextTick()
      const options = renderedOptions(w)
      expect(options).toHaveLength(1)
      expect(options[0].props.value).toBe('Organoid')
      const row = mount({ render: () => options[0].children.default() })
      expect(row.text()).toBe('No match — Add “Organoid” (pending curation)')
      expect(row.find('.v2-ac-empty__action').text()).toBe('Add “Organoid”')
      select.vm.$emit('update:modelValue', 'Organoid')
      expect(w.emitted('input')).toEqual([['Organoid']])
      // the list closing resets the filter
      select.props('filterMethod')('')
      await nextTick()
      expect(renderedOptions(w).map((v: any) => v.props.label)).toEqual(['Tissue', 'Cell culture'])
    })

    describe('driven through the real select (typing, Enter, clicks)', () => {
      /** the real ElSelect with its dropdown (teleported to body by the real ElTooltip) */
      const buildReal = () =>
        mount(EnumField, {
          props: { value: null, options: sampleTypes, allowCreate: true },
          attachTo: document.body,
          global: { stubs: { 'el-select': false, 'el-option': false, 'el-tooltip': false, ElTooltip: false } },
        })
      /** opens the list the way a pointer does, then types into the filter input */
      const typeInto = async (w: ReturnType<typeof buildReal>, text: string) => {
        await w.find('.el-select').trigger('mouseenter')
        await w.find('.select-trigger').trigger('click')
        await w.find('input').trigger('focus')
        await w.find('input').setValue(text)
        // ElSelect debounces the query by 0 ms (a timer), then filters
        await new Promise((resolve) => setTimeout(resolve, 10))
        await flushPromises()
      }
      const shownRows = () =>
        Array.from(document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).filter(
          (li) => li.style.display !== 'none'
        )

      afterEach(() => {
        document.body.innerHTML = ''
      })

      it('typing an option in another case shows that option and no "No match" row; Enter picks it', async () => {
        const w = buildReal()
        await typeInto(w, 'tissue')
        expect(shownRows().map((li) => li.textContent)).toEqual(['Tissue'])
        expect(document.body.querySelector('.v2-ac-empty')).toBeNull()
        await w.find('input').trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(w.emitted('input')).toEqual([['tissue']])
        w.unmount()
      })

      it('typing unknown text shows only the "No match" row; Enter emits the typed text', async () => {
        const w = buildReal()
        await typeInto(w, ' Organoid ')
        const rows = shownRows()
        expect(rows).toHaveLength(1)
        expect(rows[0].textContent).toBe('No match — Add “Organoid” (pending curation)')
        await w.find('input').trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(w.emitted('input')).toEqual([['Organoid']])
        w.unmount()
      })

      it('clicking a filtered option emits its value', async () => {
        const w = buildReal()
        await typeInto(w, 'cult')
        const row = shownRows().find((li) => li.textContent === 'Cell culture')
        expect(row).toBeDefined()
        row!.click()
        await flushPromises()
        expect(w.emitted('input')).toEqual([['cell_culture']])
        w.unmount()
      })

      it('clicking the "No match" row emits the typed text', async () => {
        const w = buildReal()
        await typeInto(w, 'Organoid')
        const row = shownRows().find((li) => li.querySelector('.v2-ac-empty'))
        expect(row).toBeDefined()
        row!.click()
        await flushPromises()
        expect(w.emitted('input')).toEqual([['Organoid']])
        w.unmount()
      })
    })
  })
})
