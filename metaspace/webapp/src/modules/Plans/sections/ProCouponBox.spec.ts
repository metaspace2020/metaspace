import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProCouponBox from './ProCouponBox'

describe('ProCouponBox', () => {
  it('renders the label and the code', () => {
    const wrapper = mount(ProCouponBox, { props: { code: 'ADVANCEDPROMO1', percent: 40, copied: false } })
    expect(wrapper.find('.pro-coupon__label').text()).toBe('BLACK FRIDAY CODE · 40% OFF')
    expect(wrapper.find('.pro-coupon__code').text()).toBe('ADVANCEDPROMO1')
  })

  it('shows Copy or Copied by prop', async () => {
    const wrapper = mount(ProCouponBox, { props: { code: 'X', percent: 40, copied: false } })
    expect(wrapper.find('button').text()).toBe('Copy')
    await wrapper.setProps({ copied: true })
    expect(wrapper.find('button').text()).toBe('Copied')
  })

  it('emits copy with the code', async () => {
    const wrapper = mount(ProCouponBox, { props: { code: 'ABC', percent: 40, copied: false } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('copy')?.[0]).toEqual(['ABC'])
  })

  it('names the code in the accessible label of the button', async () => {
    const wrapper = mount(ProCouponBox, { props: { code: 'ADVANCEDPROMO1', percent: 40, copied: false } })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Copy code ADVANCEDPROMO1')
    await wrapper.setProps({ copied: true })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Copied code ADVANCEDPROMO1')
  })
})
