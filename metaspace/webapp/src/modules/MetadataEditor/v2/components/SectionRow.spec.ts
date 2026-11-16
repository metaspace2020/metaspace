import { mount } from '@vue/test-utils'
import { SectionRow } from './SectionRow'

describe('SectionRow', () => {
  it('renders title, help and the body slot', () => {
    const w = mount(SectionRow, {
      props: { title: 'Sample', help: 'Organism and tissue' },
      slots: { default: '<input id="ctl" />' },
    })
    expect(w.find('.section-row__title').text()).toBe('Sample')
    expect(w.find('.section-row__help').text()).toBe('Organism and tissue')
    expect(w.find('.section-row__body #ctl').exists()).toBe(true)
  })

  it('lets the title slot override the title text and omits empty help', () => {
    const w = mount(SectionRow, { props: { title: 'Visibility' }, slots: { title: '<b>Vis!</b>' } })
    expect(w.find('.section-row__title').text()).toBe('Vis!')
    expect(w.find('.section-row__help').exists()).toBe(false)
  })
})
