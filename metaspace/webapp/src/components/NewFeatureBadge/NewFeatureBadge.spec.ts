import { mount } from '@vue/test-utils'
import Vue from 'vue'
import NewFeatureBadge, { hideFeatureBadge } from './NewFeatureBadge'

const TestNewFeatureBadge = Vue.component('test', {
  functional: true,
  render: (h, { props }) => h(NewFeatureBadge, { props }, [h('span', {}, 'Badge Content')]),
})

const featureKey = 'test'

describe('NewFeatureBadge', () => {
  it('should render a badge', () => {
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should hide the badge', async() => {
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    hideFeatureBadge(featureKey)
    await Vue.nextTick()
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should not render the badge if already hidden', () => {
    hideFeatureBadge(featureKey)
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should not render the badge if stale', () => {
    const spy = jest.spyOn(global.Date, 'now').mockImplementation(() => new Date('2020-01-02T00:00:00.000').valueOf())
    const wrapper = mount(TestNewFeatureBadge, {
      propsData: { featureKey, showUntil: new Date('2020-01-01T00:00:00.000') },
    })
    expect(wrapper.classes()).toMatchSnapshot()
    spy.mockRestore()
  })
})
