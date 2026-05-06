import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import MatchModeSelector from './MatchModeSelector'

describe('MatchModeSelector', () => {
  it('renders chip per mapping', () => {
    const w = mount(MatchModeSelector, {
      props: {
        modelValue: 'MANUAL',
        mappings: [
          { id: 'm1', label: 'DS1 - Cluster 2 → DS2 - Roi 0' },
          { id: 'm2', label: 'DS2 - Roi 0 → DSN - Roi n' },
        ],
      },
    })
    expect(w.findAll('[data-test-key^="mapping-chip-"]:not([data-test-key$="-remove"])')).toHaveLength(2)
  })

  it('emits remove when chip x clicked', async () => {
    const w = mount(MatchModeSelector, {
      props: {
        modelValue: 'MANUAL',
        mappings: [{ id: 'm1', label: 'A→B' }],
      },
    })
    await w.find('[data-test-key="mapping-chip-m1-remove"]').trigger('click')
    expect(w.emitted('remove-mapping')?.[0]).toEqual(['m1'])
  })
})
