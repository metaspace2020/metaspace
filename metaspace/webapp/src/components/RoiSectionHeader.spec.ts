import { mount } from '@vue/test-utils'
import { h } from 'vue'
import RoiSectionHeader from './RoiSectionHeader'

describe('RoiSectionHeader', () => {
  it('renders the title and the count in parentheses', () => {
    const wrapper = mount(RoiSectionHeader, { props: { title: 'Dataset ROIs', count: 5, collapsed: false } })
    expect(wrapper.find('.roi-section-title').text()).toBe('Dataset ROIs')
    expect(wrapper.find('.roi-section-count').text()).toBe('(5)')
  })

  it('omits the count when none is given', () => {
    const wrapper = mount(RoiSectionHeader, { props: { title: 'Groups' } })
    expect(wrapper.find('.roi-section-count').exists()).toBe(false)
  })

  it('renders slot content after the count', () => {
    const wrapper = mount(RoiSectionHeader, {
      props: { title: 'Assign ROIs', count: 2 },
      slots: { default: () => h('button', { class: 'info' }, 'i') },
    })
    const html = wrapper.html()
    expect(wrapper.find('.info').exists()).toBe(true)
    expect(html.indexOf('roi-section-count')).toBeLessThan(html.indexOf('class="info"'))
  })

  it('emits toggle when anywhere on the row is clicked, once per click', async () => {
    const wrapper = mount(RoiSectionHeader, { props: { title: 'Groups', count: 0, collapsed: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    await wrapper.find('button.roi-section-toggle').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(2)
    await wrapper.find('.roi-section-chevron').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(3)
  })

  it('does not emit toggle when the slotted element is clicked', async () => {
    const wrapper = mount(RoiSectionHeader, {
      props: { title: 'Assign ROIs', count: 2 },
      slots: { default: () => h('button', { class: 'info' }, 'i') },
    })
    await wrapper.find('.info').trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('reflects collapsed in aria-expanded on the toggle button and swaps the chevron', async () => {
    const wrapper = mount(RoiSectionHeader, { props: { title: 'Groups', count: 0, collapsed: true } })
    const button = () => wrapper.find('button.roi-section-toggle')
    expect(button().attributes('type')).toBe('button')
    expect(button().attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.roi-section-chevron').attributes('data-collapsed')).toBe('true')
    await wrapper.setProps({ collapsed: false })
    expect(button().attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.roi-section-chevron').attributes('data-collapsed')).toBe('false')
  })

  describe('collapsible: false (empty section)', () => {
    const mountStatic = () =>
      mount(RoiSectionHeader, { props: { title: 'Dataset ROIs', count: 0, collapsed: true, collapsible: false } })

    it('keeps the title and count but has no chevron and no toggle button', () => {
      const wrapper = mountStatic()
      expect(wrapper.find('.roi-section-title').text()).toBe('Dataset ROIs')
      expect(wrapper.find('.roi-section-count').text()).toBe('(0)')
      expect(wrapper.find('.roi-section-chevron').exists()).toBe(false)
      expect(wrapper.find('button').exists()).toBe(false)
      expect(wrapper.find('[aria-expanded]').exists()).toBe(false)
      expect(wrapper.classes()).toContain('is-static')
    })

    it('does not emit toggle on click', async () => {
      const wrapper = mountStatic()
      await wrapper.trigger('click')
      await wrapper.find('.roi-section-title').trigger('click')
      expect(wrapper.emitted('toggle')).toBeUndefined()
    })

    it('becomes interactive again when collapsible turns true', async () => {
      const wrapper = mountStatic()
      await wrapper.setProps({ collapsible: true })
      expect(wrapper.find('.roi-section-chevron').exists()).toBe(true)
      expect(wrapper.find('button.roi-section-toggle').attributes('aria-expanded')).toBe('false')
      expect(wrapper.classes()).not.toContain('is-static')
      await wrapper.trigger('click')
      expect(wrapper.emitted('toggle')).toHaveLength(1)
    })
  })
})
