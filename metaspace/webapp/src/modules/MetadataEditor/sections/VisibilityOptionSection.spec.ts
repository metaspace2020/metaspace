import { mount } from '@vue/test-utils'
import VisibilityOptionSection from './VisibilityOptionSection.vue'
import { ElSwitch } from '../../../lib/element-plus'

describe('VisibilityOptionSection', () => {
  it('disables the switch and shows the reason while public is gated', () => {
    const w = mount(VisibilityOptionSection, {
      props: {
        isPublic: false,
        disablePublic: true,
        disabledReason: 'Public requires a complete v2 record — 1 required fields missing.',
      },
    })
    expect(w.findComponent(ElSwitch).props('disabled')).toBe(true)
    expect(w.text()).toContain('1 required fields missing')
  })
  it('never gates switching back to private', () => {
    const w = mount(VisibilityOptionSection, { props: { isPublic: true, disablePublic: true, disabledReason: 'x' } })
    expect(w.findComponent(ElSwitch).props('disabled')).toBe(false)
  })
})
