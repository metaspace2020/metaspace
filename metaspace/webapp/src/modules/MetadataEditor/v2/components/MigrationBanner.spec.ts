import { mount } from '@vue/test-utils'
import { MigrationBanner } from './MigrationBanner'

const status = (over = {}) => ({
  requiredTotal: 9,
  requiredFilled: 7,
  missingRequired: [],
  reviewCount: 5,
  unmappedCount: 2,
  migratedCount: 8,
  status: 'partial' as const,
  ...over,
})

describe('MigrationBanner', () => {
  it('renders the partial sentence with three counters and a stacked bar', () => {
    const w = mount(MigrationBanner, { props: { status: status(), failedSlots: [] } })
    expect(w.text()).toContain('PARTIALLY MIGRATED')
    expect(w.text()).toContain('7 of 9 required fields filled')
    expect(w.text()).toContain('5 need your review')
    expect(w.text()).toContain('2 legacy values could not be mapped')
    expect(w.findAll('.v2-bar__seg')).toHaveLength(2)
  })
  it('renders the success tag when complete and lists failed slots', () => {
    const w = mount(MigrationBanner, {
      props: {
        status: status({ status: 'complete', reviewCount: 0, unmappedCount: 0, requiredFilled: 9 }),
        failedSlots: ['organism'],
      },
    })
    expect(w.text()).toContain('Described in schema v2')
    expect(w.text()).toContain('organism')
  })
})
