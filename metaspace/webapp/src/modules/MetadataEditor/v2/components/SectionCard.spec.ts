import { mount } from '@vue/test-utils'
import { RequiredCounter, SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders title, subtitle and slots, and toggles the body with aria-expanded', async () => {
    const w = mount(SectionCard, {
      props: { title: 'Metadata', subtitle: 'sample and acquisition' },
      slots: {
        default: '<p id="body">B</p>',
        headerRight: '<span id="right">R</span>',
        afterTitle: '<i id="badge" />',
      },
    })
    const toggle = w.find('button.section-card__toggle')
    expect(toggle.text()).toContain('Metadata')
    expect(toggle.text()).toContain('— sample and acquisition')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.find('.section-card__right #right').exists()).toBe(true)
    expect(w.find('#badge').exists()).toBe(true)
    expect(w.find('#body').exists()).toBe(true)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.find('#body').exists()).toBe(false)
    await toggle.trigger('click')
    expect(w.find('#body').exists()).toBe(true)
  })

  it('starts collapsed when asked and applies the legacy variant', () => {
    const w = mount(SectionCard, {
      props: { title: 'T', variant: 'legacy', defaultCollapsed: true },
      slots: { default: '<p id="body">B</p>' },
    })
    expect(w.classes()).toContain('section-card--legacy')
    expect(w.find('#body').exists()).toBe(false)
    expect(w.find('button').attributes('aria-expanded')).toBe('false')
  })

  it('expand() opens a collapsed card', async () => {
    const w = mount(SectionCard, {
      props: { title: 'T', defaultCollapsed: true },
      slots: { default: '<p id="body">B</p>' },
    })
    ;(w.vm as unknown as { expand: () => void }).expand()
    await w.vm.$nextTick()
    expect(w.find('#body').exists()).toBe(true)
  })

  it('RequiredCounter renders the count and the bar width', () => {
    const w = mount(RequiredCounter, { props: { filled: 1, total: 4, bar: true } })
    expect(w.text()).toContain('1 of 4 required')
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('25')
    expect(w.find('[role="progressbar"] > span').attributes('style')).toContain('width: 25%')
  })
})
