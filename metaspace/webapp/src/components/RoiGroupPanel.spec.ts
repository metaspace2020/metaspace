import { DOMWrapper, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { Hide, View } from '@element-plus/icons-vue'
import { ElPopover, ElSelect } from '../lib/element-plus'
import RoiGroupPanel, { RoiColorPicker } from './RoiGroupPanel'

/** Stands in for ElColorPicker (its dropdown is teleported); tests drive it through its change event. */
const ColorPickerStub = defineComponent({
  name: 'ElColorPicker',
  props: {
    modelValue: { type: String, default: undefined },
    predefine: { type: Array, default: undefined },
    showAlpha: { type: Boolean, default: false },
    colorFormat: { type: String, default: undefined },
    size: { type: String, default: undefined },
    label: { type: String, default: undefined },
    popperClass: { type: String, default: undefined },
  },
  emits: ['update:modelValue', 'change'],
  setup(props) {
    return () => h('div', { class: 'color-picker-stub', 'data-value': props.modelValue })
  },
})

const rois = [
  { key: 'a', name: 'ROI 1', channel: 'magenta', groupLabel: 'Group A', visible: true },
  { key: 'b', name: 'ROI 2', channel: 'green', groupLabel: 'Group A', visible: false },
  { key: 'c', name: 'ROI 3', channel: 'blue', groupLabel: 'Group B', visible: true },
]
const groups = [
  { name: 'Group A', channel: 'red' },
  { name: 'Group B', channel: 'cyan' },
]

const mountPanel = (extra: { assignCollapsed?: boolean; groupListCollapsed?: boolean } = {}) =>
  mount(RoiGroupPanel, {
    props: { rois, groups, ...extra },
    global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
  })

describe('RoiGroupPanel', () => {
  it('shows each group on a single line: swatch, name and actions, without a member list', () => {
    const wrapper = mountPanel()
    const row = wrapper.findAll('.roi-group-item')[0]
    expect(row.find('.roi-group-name').text()).toBe('Group A')
    expect(row.text()).not.toContain('ROI 1')
    expect(row.find('.roi-group-members').exists()).toBe(false)
  })

  it('emits assign when a ROI group is changed, including No group', async () => {
    const wrapper = mountPanel()
    const selects = wrapper.findAllComponents(ElSelect)
    expect(selects).toHaveLength(3)
    selects[0].vm.$emit('update:modelValue', 'Group B')
    selects[1].vm.$emit('update:modelValue', '')
    await nextTick()
    expect(wrapper.emitted('assign')).toEqual([
      ['a', 'Group B'],
      ['b', ''],
    ])
  })

  it('creates a group with the default name on Enter', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.roi-group-new-btn').trigger('click')
    const input = wrapper.find('.roi-group-new input')
    expect((input.element as HTMLInputElement).value).toBe('Group C')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('create')).toEqual([['Group C']])
  })

  it('rejects a duplicate name and shows the error', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.roi-group-new-btn').trigger('click')
    const input = wrapper.find('.roi-group-new input')
    await input.setValue('group a')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('create')).toBeUndefined()
    expect(wrapper.text()).toContain('A group with this name already exists.')
  })

  it('closes on Escape without emitting', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.roi-group-new-btn').trigger('click')
    await wrapper.find('.roi-group-new input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.roi-group-new').exists()).toBe(false)
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('renames a group on Enter and rejects invalid names', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.roi-group-edit-btn')[0].trigger('click')
    const input = wrapper.find('.roi-group-rename input')
    await input.setValue('Group B')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(wrapper.text()).toContain('A group with this name already exists.')
    await input.setValue('Tumour')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('rename')).toEqual([['Group A', 'Tumour']])
    expect(wrapper.find('.roi-group-rename').exists()).toBe(false)
  })

  it('emits toggleVisible from the eye button', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.roi-group-eye-btn')[1].trigger('click')
    expect(wrapper.emitted('toggleVisible')).toEqual([['Group B']])
  })

  it('orders the group row actions eye, pencil, trash, with outline View / Hide eye icons', () => {
    const wrapper = mount(RoiGroupPanel, {
      props: {
        rois: [rois[0], { ...rois[1], groupLabel: 'Group B', visible: false }],
        groups: [...groups, { name: 'Group C', channel: 'blue' }],
      },
      global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
    })
    const rows = wrapper.findAll('.roi-group-item')
    const order = rows[0].findAll('.roi-actions > button').map((b) => b.classes())
    expect(order.map((c) => c.find((name) => /^roi-group-(eye|edit|remove)-btn$/.test(name)))).toEqual([
      'roi-group-eye-btn',
      'roi-group-edit-btn',
      'roi-group-remove-btn',
    ])
    expect(rows[0].findComponent(View).exists()).toBe(true)
    expect(rows[1].findComponent(Hide).exists()).toBe(true)
    expect(rows[0].find('.roi-group-eye-btn').attributes('aria-label')).toBe('Hide group')
    expect(rows[1].find('.roi-group-eye-btn').attributes('aria-label')).toBe('Show group')
    expect(rows[0].find('.roi-group-edit-btn').attributes('aria-label')).toBe('Rename group')
    expect(rows[0].find('.roi-group-edit-btn').attributes('title')).toBe('Rename group')
    // Group C has no ROIs: its eye is disabled
    expect(rows[2].find('.roi-group-eye-btn').attributes('disabled')).toBeDefined()
  })

  it('gives each group a hex colour picker on its resolved colour with the nine palette swatches as hex', () => {
    const wrapper = mountPanel()
    const pickers = wrapper.findAllComponents(ColorPickerStub)
    expect(pickers).toHaveLength(2)
    expect(pickers[1].props('modelValue')).toBe('#00FFFF')
    expect(pickers[1].props('predefine')).toEqual([
      '#FF00FF',
      '#00FF00',
      '#0000FF',
      '#FF0000',
      '#FFFF00',
      '#00FFFF',
      '#FF8000',
      '#8000FF',
      '#FFFFFF',
    ])
    expect(pickers[1].props('showAlpha')).toBe(false)
    expect(pickers[1].props('colorFormat')).toBe('hex')
    expect(pickers[1].props('size')).toBe('small')
  })

  it('recolours a group: palette name for a palette hex, rgb string for a custom hex, junk ignored', async () => {
    const wrapper = mountPanel()
    const pickers = wrapper.findAllComponents(ColorPickerStub)
    pickers[1].vm.$emit('change', '#8000FF')
    pickers[0].vm.$emit('change', '#0A141E')
    pickers[0].vm.$emit('change', '#0a141f')
    pickers[0].vm.$emit('change', null)
    pickers[0].vm.$emit('change', 'nope')
    await nextTick()
    expect(wrapper.emitted('recolor')).toEqual([
      ['Group B', 'violet'],
      ['Group A', 'rgb(10, 20, 30)'],
      ['Group A', 'rgb(10, 20, 31)'],
    ])
  })

  it('gives the picker a #f00 colour as #FF0000', () => {
    const wrapper = mount(RoiColorPicker, {
      props: { rgb: '#f00', label: 'Colour of ROI 1' },
      global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
    })
    expect(wrapper.findComponent(ColorPickerStub).props('modelValue')).toBe('#FF0000')
    expect(wrapper.find('.roi-color-picker').classes()).not.toContain('has-fallback')
  })

  it('paints a colour the picker cannot represent behind its swatch instead of showing no colour', () => {
    const wrapper = mount(RoiColorPicker, {
      props: { rgb: 'hsl(0, 100%, 50%)', label: 'Colour of ROI 1' },
      global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
    })
    expect(wrapper.findComponent(ColorPickerStub).props('modelValue')).toBe('')
    const root = wrapper.find('.roi-color-picker')
    expect(root.classes()).toContain('has-fallback')
    expect((root.element as HTMLElement).style.getPropertyValue('--roi-picker-fallback')).toBe('hsl(0, 100%, 50%)')
  })

  it('emits the stored value and its rgb from RoiColorPicker for a picked hex', async () => {
    const wrapper = mount(RoiColorPicker, {
      props: { rgb: 'rgb(255, 0, 0)', label: 'Colour of ROI 1' },
      global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
    })
    const picker = wrapper.findComponent(ColorPickerStub)
    expect(picker.props('modelValue')).toBe('#FF0000')
    picker.vm.$emit('change', '#FF8000')
    picker.vm.$emit('change', '#123456')
    await nextTick()
    expect(wrapper.emitted('pick')).toEqual([
      ['orange', 'rgb(255, 128, 0)'],
      ['rgb(18, 52, 86)', 'rgb(18, 52, 86)'],
    ])
  })

  it('shows an rgb-string group colour in the group swatch of the assign rows', () => {
    const wrapper = mount(RoiGroupPanel, {
      props: { rois, groups: [{ name: 'Group A', channel: 'rgb(10, 20, 30)' }] },
      global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
    })
    const swatch = wrapper.findAll('.roi-group-assign-row')[0].find('.roi-group-swatch')
    expect(swatch.attributes('style')).toContain('rgb(10, 20, 30)')
  })

  it('removes a group with the trash button', async () => {
    const wrapper = mountPanel()
    const trash = wrapper.findAll('.roi-group-remove-btn')
    expect(trash).toHaveLength(2)
    expect(trash[0].attributes('aria-label')).toBe('Remove group')
    expect(trash[0].attributes('title')).toBe('Remove group')
    await trash[0].trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['Group A']])
  })

  it('shows each ROI as a round dot in its own colour, in a 22px slot, with an uncoloured name', () => {
    const wrapper = mountPanel()
    const rows = wrapper.findAll('.roi-group-assign-row')
    const dot = rows[0].find('.roi-indicator-slot > .roi-dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('tabindex')).toBeUndefined()
    const afterSlot = rows[0].find('.roi-indicator-slot').element.nextElementSibling
    expect(afterSlot?.classList.contains('roi-group-roi-name')).toBe(true)
    expect(dot.attributes('style')).toContain('background: rgb(255, 0, 255)')
    expect(rows[0].find('.roi-group-roi-name').attributes('style')).toBeUndefined()
    expect(rows[0].find('.roi-group-roi-name').attributes('title')).toBe('ROI 1')
  })

  it('previews a new group in a colour no ROI or group uses', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.roi-group-new-btn').trigger('click')
    expect(wrapper.find('.roi-group-new .roi-group-swatch').attributes('style')).toContain('rgb(128, 0, 255)')
  })

  it('puts the full group name in a title', () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.roi-group-name').map((el) => el.attributes('title'))).toEqual(['Group A', 'Group B'])
  })

  describe('collapsible sections', () => {
    const headers = (wrapper: ReturnType<typeof mountPanel>) => wrapper.findAll('.roi-section-header')
    const expanded = (header: ReturnType<typeof headers>[number]) =>
      header.find('button.roi-section-toggle').attributes('aria-expanded')

    it('shows both sections expanded by default, with their counts', () => {
      const wrapper = mountPanel()
      const [assign, list] = headers(wrapper)
      expect(assign.find('.roi-section-title').text()).toBe('Assign ROIs')
      expect(assign.find('.roi-section-count').text()).toBe('(3)')
      expect(list.find('.roi-section-title').text()).toBe('Groups')
      expect(list.find('.roi-section-count').text()).toBe('(2)')
      expect(expanded(assign)).toBe('true')
      expect(expanded(list)).toBe('true')
      expect(wrapper.findAll('.roi-group-assign-row')).toHaveLength(3)
      expect(wrapper.find('.roi-group-new-btn').exists()).toBe(true)
    })

    it('explains ungrouped ROIs with a focusable info icon that does not collapse the section', async () => {
      const wrapper = mountPanel()
      const [assign] = headers(wrapper)
      const info = assign.find('button.roi-group-info')
      expect(info.attributes('aria-label')).toBe('ROIs without a group are left out of the comparison')
      expect(info.attributes('type')).toBe('button')
      await info.trigger('click')
      expect(wrapper.emitted('toggleAssign')).toBeUndefined()
    })

    it('hides the assignment rows but keeps their header when assignCollapsed', async () => {
      const wrapper = mountPanel({ assignCollapsed: true })
      const [assign] = headers(wrapper)
      expect(wrapper.findAll('.roi-group-assign-row')).toHaveLength(0)
      expect(expanded(assign)).toBe('false')
      await assign.trigger('click')
      expect(wrapper.emitted('toggleAssign')).toHaveLength(1)
    })

    it('hides the groups, the New group button and editors when groupListCollapsed', async () => {
      const wrapper = mountPanel({ groupListCollapsed: true })
      const list = headers(wrapper)[1]
      expect(wrapper.findAll('.roi-group-item')).toHaveLength(0)
      expect(wrapper.find('.roi-group-new-btn').exists()).toBe(false)
      expect(expanded(list)).toBe('false')
      expect(wrapper.findAll('.roi-group-assign-row')).toHaveLength(3)
      await list.trigger('click')
      expect(wrapper.emitted('toggleGroupList')).toHaveLength(1)
    })
  })

  // Real Element Plus picker: its dropdown closes from a document mouseup listener (click-outside) that counts the
  // swatch as outside, and its swatch click toggles it through a 100ms leading+trailing debounce
  describe('RoiColorPicker with the real Element Plus picker', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
      document.body.innerHTML = ''
    })

    const press = async (el: Element) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await nextTick()
      vi.advanceTimersByTime(300)
      await nextTick()
      await nextTick()
    }

    const mountPicker = () => {
      const wrapper = mount(RoiColorPicker, {
        props: { rgb: 'rgb(255, 0, 0)', label: 'Colour of ROI 1' },
        attachTo: document.body,
        // setupTests stubs ElTooltip globally; the picker's open state lives in its real tooltip
        global: { stubs: { 'el-tooltip': false, ElTooltip: false } },
      })
      // Vue drops events time-stamped before their listener was attached; with a faked clock, let time pass first
      vi.advanceTimersByTime(1000)
      return wrapper
    }

    const isOpen = (wrapper: ReturnType<typeof mountPicker>) =>
      wrapper.find('.el-color-picker').attributes('aria-describedby') != null

    it('opens on a swatch click and stays closed after a second swatch click', async () => {
      const wrapper = mountPicker()
      const swatch = wrapper.find('.el-color-picker__trigger').element
      expect(isOpen(wrapper)).toBe(false)
      await press(swatch)
      expect(isOpen(wrapper)).toBe(true)
      await press(swatch)
      expect(isOpen(wrapper)).toBe(false)
      await press(swatch)
      expect(isOpen(wrapper)).toBe(true)
      wrapper.unmount()
    })

    it('closes on a click outside', async () => {
      const wrapper = mountPicker()
      await press(wrapper.find('.el-color-picker__trigger').element)
      expect(isOpen(wrapper)).toBe(true)
      await press(document.body)
      expect(isOpen(wrapper)).toBe(false)
      wrapper.unmount()
    })
  })

  describe('empty states', () => {
    const ungrouped = rois.map((roi) => ({ ...roi, groupLabel: '' }))
    const mountWith = (props: Record<string, unknown>) =>
      mount(RoiGroupPanel, {
        props: { rois: ungrouped, groups: [], ...props },
        global: { stubs: { ElColorPicker: ColorPickerStub, 'el-color-picker': ColorPickerStub } },
      })
    const optionLabels = (select: DOMWrapper<Element>) =>
      select.findAll('.mock-el-option').map((option) => option.attributes('label'))

    it('with no ROIs shows one line instead of both sections', () => {
      const wrapper = mountWith({ rois: [] })
      expect(wrapper.find('.roi-empty').text()).toBe('No ROIs to group yet. Add an ROI first.')
      expect(wrapper.find('.roi-empty').classes()).toContain('roi-empty-group')
      expect(wrapper.find('.roi-section-header').exists()).toBe(false)
      expect(wrapper.find('.roi-group-assign').exists()).toBe(false)
      expect(wrapper.find('.roi-group-list').exists()).toBe(false)
      expect(wrapper.find('.roi-group-new-btn').exists()).toBe(false)
    })

    it('with ROIs but no groups lists every ROI with only No group and New group… options', () => {
      const wrapper = mountWith({})
      const selects = wrapper.findAll('.roi-group-assign-row .mock-el-select')
      expect(selects).toHaveLength(3)
      selects.forEach((select) => expect(optionLabels(select)).toEqual(['No group', 'New group…']))
      expect(wrapper.findAll('.roi-group-assign-row .roi-group-swatch-empty')).toHaveLength(3)
      expect(wrapper.find('.roi-empty').exists()).toBe(false)
    })

    it('with no groups shows "No groups yet", a centred New group button and no Groups chevron', () => {
      const wrapper = mountWith({})
      const [assign, list] = wrapper.findAll('.roi-section-header')
      expect(list.find('.roi-section-count').text()).toBe('(0)')
      expect(list.find('.roi-section-chevron').exists()).toBe(false)
      expect(list.find('[aria-expanded]').exists()).toBe(false)
      expect(assign.find('.roi-section-chevron').exists()).toBe(true)
      expect(wrapper.find('.roi-group-empty').text()).toBe('No groups yet')
      expect(wrapper.find('.roi-group-new-btn').classes()).toContain('is-centered')
    })

    it('shows the Groups body when there are no groups even if the section was collapsed', () => {
      const wrapper = mountWith({ groupListCollapsed: true })
      expect(wrapper.find('.roi-group-empty').exists()).toBe(true)
      expect(wrapper.find('.roi-group-new-btn').exists()).toBe(true)
    })

    it('once a group exists: no empty line, full-width button, groups plus No group and no New group…', () => {
      const wrapper = mountWith({ groups: [{ name: 'Group A', channel: 'red' }] })
      expect(wrapper.find('.roi-group-empty').exists()).toBe(false)
      expect(wrapper.find('.roi-group-new-btn').classes()).not.toContain('is-centered')
      expect(wrapper.findAll('.roi-section-header')[1].find('.roi-section-chevron').exists()).toBe(true)
      const select = wrapper.findAll('.roi-group-assign-row .mock-el-select')[0]
      expect(optionLabels(select)).toEqual(['Group A', 'No group'])
    })

    const chooseNewGroup = async (wrapper: ReturnType<typeof mountWith>, index: number) => {
      const select = wrapper.findAllComponents(ElSelect)[index]
      const value = select.findAll('.mock-el-option')[1].attributes('value')
      select.vm.$emit('update:modelValue', value)
      await nextTick()
      await nextTick()
    }

    it('choosing New group… opens the editor with the default name, then emits create before assign', async () => {
      const calls: string[] = []
      const wrapper = mountWith({
        onCreate: (name: string) => calls.push(`create:${name}`),
        onAssign: (key: string, name: string) => calls.push(`assign:${key}:${name}`),
      })
      await chooseNewGroup(wrapper, 1)
      expect(wrapper.emitted('assign')).toBeUndefined()
      const input = wrapper.find('.roi-group-new input')
      expect((input.element as HTMLInputElement).value).toBe('Group A')
      await input.trigger('keydown', { key: 'Enter' })
      expect(calls).toEqual(['create:Group A', 'assign:b:Group A'])
    })

    it('closes the editor opened by New group… when every ROI is gone', async () => {
      const wrapper = mountWith({})
      await chooseNewGroup(wrapper, 1)
      expect(wrapper.find('.roi-group-new').exists()).toBe(true)
      await wrapper.setProps({ rois: [] })
      await wrapper.setProps({ rois: [ungrouped[0]] })
      expect(wrapper.find('.roi-group-new').exists()).toBe(false)
      expect(wrapper.find('.roi-group-new-btn').exists()).toBe(true)
      await wrapper.find('.roi-group-new-btn').trigger('click')
      await wrapper.find('.roi-group-new input').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('create')).toEqual([['Group A']])
      expect(wrapper.emitted('assign')).toBeUndefined()
    })

    it('does not assign a ROI that was removed while its New group… editor was open', async () => {
      const wrapper = mountWith({})
      await chooseNewGroup(wrapper, 1)
      await wrapper.setProps({ rois: [ungrouped[0], ungrouped[2]] })
      expect(wrapper.find('.roi-group-new').exists()).toBe(true)
      await wrapper.find('.roi-group-new input').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('create')).toEqual([['Group A']])
      expect(wrapper.emitted('assign')).toBeUndefined()
    })

    it('leaves expanding a collapsed Groups section to the parent (on the first group)', async () => {
      const wrapper = mountWith({ groupListCollapsed: true })
      await chooseNewGroup(wrapper, 0)
      expect(wrapper.find('.roi-group-new').exists()).toBe(true)
      expect(wrapper.emitted('toggleGroupList')).toBeUndefined()
    })

    it('cancelling the editor opened by New group… emits neither create nor assign', async () => {
      const wrapper = mountWith({})
      await chooseNewGroup(wrapper, 0)
      await wrapper.find('.roi-group-new input').trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('create')).toBeUndefined()
      expect(wrapper.emitted('assign')).toBeUndefined()
      // A later creation from the New group button does not assign the ROI that asked before
      await wrapper.find('.roi-group-new-btn').trigger('click')
      await wrapper.find('.roi-group-new input').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('create')).toEqual([['Group A']])
      expect(wrapper.emitted('assign')).toBeUndefined()
    })
  })

  // Real Element Plus select inside a real ElPopover, as in the ROI panel. The select's dropdown is a popper with a
  // focus trap; when it closes it refocuses what had focus before it engaged. jsdom does not move focus on mousedown,
  // so `pointerSelect` does what a browser does: focus the nearest focusable ancestor of the option (the dropdown)
  // unless mousedown was default-prevented.
  describe('"New group…" with the real Element Plus select', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    const mountReal = (calls: string[]) => {
      const Host = defineComponent({
        setup() {
          const groups = ref<Array<{ name: string; channel: string }>>([])
          return () =>
            h(
              ElPopover,
              { visible: true, popperClass: 'roi-popper' },
              {
                reference: () => h('button', { class: 'roi-btn' }, 'ROI'),
                default: () =>
                  h(RoiGroupPanel, {
                    rois: rois.map((roi) => ({ ...roi, groupLabel: '' })),
                    groups: groups.value,
                    onCreate: (name: string) => {
                      calls.push(`create:${name}`)
                      groups.value = [...groups.value, { name, channel: 'red' }]
                    },
                    onAssign: (key: string, name: string) => calls.push(`assign:${key}:${name}`),
                  }),
              }
            )
        },
      })
      return mount(Host, {
        attachTo: document.body,
        global: {
          stubs: {
            ElColorPicker: ColorPickerStub,
            'el-color-picker': ColorPickerStub,
            'el-select': false,
            ElSelect: false,
            'el-option': false,
            ElOption: false,
            'el-tooltip': false,
            ElTooltip: false,
            'el-popover': false,
            ElPopover: false,
          },
        },
      })
    }

    const pointerFocus = (el: HTMLElement) => {
      const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      el.dispatchEvent(mousedown)
      if (!mousedown.defaultPrevented) {
        ;(el.closest('button, input, [tabindex]') as HTMLElement | null)?.focus()
      }
    }

    const pointerSelect = async (option: HTMLElement) => {
      pointerFocus(option)
      await wait(50)
      option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      await wait(300) // dropdown close, focus-trap release
    }

    it('leaves keyboard focus in the editor input with its text selected, and the select on No group', async () => {
      const calls: string[] = []
      const wrapper = mountReal(calls)
      await wait(50)
      pointerFocus(document.querySelector<HTMLElement>('.roi-btn') as HTMLElement)
      await wait(50)
      const selectInput = document.querySelectorAll<HTMLInputElement>('.roi-group-assign-row .el-select input')[2]
      pointerFocus(selectInput)
      selectInput.closest('.select-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(300)
      const options = Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).filter(
        (option) => option.textContent === 'New group…'
      )
      await pointerSelect(options[2])

      const input = document.querySelector('.roi-group-list .roi-group-new input') as HTMLInputElement
      expect(document.activeElement).toBe(input)
      expect(input.value).toBe('Group A')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Group A'.length])
      expect(selectInput.value).toBe('No group')
      expect(calls).toEqual([])
      wrapper.unmount()
    })
  })

  it('ignores Enter during an IME composition', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.roi-group-new-btn').trigger('click')
    const input = wrapper.find('.roi-group-new input')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('create')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('create')).toHaveLength(1)
  })
})
