import { describe, it, expect } from 'vitest'
import { resolveRenameTarget, seedNameModeGroups } from './groupNaming'

describe('resolveRenameTarget', () => {
  it('returns the typed name when no collision', () => {
    expect(resolveRenameTarget('urban', ['rural', 'auto_1'])).toBe('urban')
  })
  it('appends " 2" when typed name collides', () => {
    expect(resolveRenameTarget('roi', ['roi'])).toBe('roi 2')
  })
  it('finds the next free suffix', () => {
    expect(resolveRenameTarget('roi', ['roi', 'roi 2', 'roi 3'])).toBe('roi 4')
  })
})

describe('seedNameModeGroups', () => {
  const mkR = (regionKey: string, labelGroupName: string | null, label: string) => ({
    regionKey,
    labelGroupName,
    _label: label,
  })

  it('creates groups for labels appearing in 2+ datasets, ignoring already-grouped regions', () => {
    const datasets = [
      { datasetId: 'd1', regions: [mkR('a1', null, 'ROI 1'), mkR('a2', null, 'ROI 2')] },
      { datasetId: 'd2', regions: [mkR('b1', null, 'ROI 1'), mkR('b2', null, 'X')] },
    ]
    const labelGroups: { name: string; color: string }[] = []
    const labelOf = (r: any) => r._label
    const palette = ['#aaa', '#bbb']

    const out = seedNameModeGroups({ datasets, labelGroups, labelOf, palette })
    expect(out.labelGroups).toEqual([{ name: 'ROI 1', color: '#aaa' }])
    expect(out.datasets[0].regions[0].labelGroupName).toBe('ROI 1')
    expect(out.datasets[1].regions[0].labelGroupName).toBe('ROI 1')
    expect(out.datasets[0].regions[1].labelGroupName).toBe(null)
    expect(out.datasets[1].regions[1].labelGroupName).toBe(null)
  })

  it('is idempotent — does not reassign already-grouped regions', () => {
    const datasets = [
      { datasetId: 'd1', regions: [mkR('a1', 'downtown', 'ROI 1')] },
      { datasetId: 'd2', regions: [mkR('b1', null, 'ROI 1')] },
    ]
    const labelGroups = [{ name: 'downtown', color: '#aaa' }]
    const out = seedNameModeGroups({ datasets, labelGroups, labelOf: (r: any) => r._label, palette: ['#bbb'] })
    expect(out.datasets[0].regions[0].labelGroupName).toBe('downtown')
    expect(out.labelGroups).toEqual([{ name: 'downtown', color: '#aaa' }])
    expect(out.datasets[1].regions[0].labelGroupName).toBe(null)
  })

  it('suffixes generated names that collide with existing groups', () => {
    const datasets = [
      { datasetId: 'd1', regions: [mkR('a1', null, 'ROI 1')] },
      { datasetId: 'd2', regions: [mkR('b1', null, 'ROI 1')] },
    ]
    const labelGroups = [{ name: 'ROI 1', color: '#aaa' }]
    const out = seedNameModeGroups({ datasets, labelGroups, labelOf: (r: any) => r._label, palette: ['#bbb'] })
    expect(out.labelGroups.map((g) => g.name)).toEqual(['ROI 1', 'ROI 1 2'])
    expect(out.datasets[0].regions[0].labelGroupName).toBe('ROI 1 2')
  })
})
