import { mount } from '@vue/test-utils'
import { MigrationBanner } from './MigrationBanner'

const status = (over = {}) => ({
  requiredTotal: 9,
  requiredFilled: 7,
  missingRequired: [],
  migratedCount: 8,
  ...over,
})

describe('MigrationBanner', () => {
  it('renders one sentence with the migrated and required counters', () => {
    const w = mount(MigrationBanner, { props: { status: status(), failedSlots: [] } })
    expect(w.text()).toContain('8 values migrated from the legacy record, 7 of 9 required fields filled.')
    expect(w.find('.v2-banner__note').exists()).toBe(false)
  })
  it('lists failed slots', () => {
    const w = mount(MigrationBanner, { props: { status: status(), failedSlots: ['organism'] } })
    expect(w.find('.v2-banner__note').text()).toContain('organism')
  })
})
