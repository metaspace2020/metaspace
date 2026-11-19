import { describeComparison, formatConsistency, resolveComparison } from './roiGroups'

const rois = (spec: Array<[string, string | null, boolean?]>) =>
  spec.map(([id, groupLabel, includeInDiff]) => ({ id, name: `roi-${id}`, groupLabel, includeInDiff }))

describe('resolveComparison', () => {
  it('treats unlabeled ROIs as vs_rest singletons', () => {
    const result = resolveComparison(
      rois([
        ['1', null],
        ['2', ' '],
        ['3', null],
      ])
    )
    expect(result).toMatchObject({ mode: 'vs_rest', groupCount: 3, referenceGroup: null })
  })

  it('keeps two unlabeled ROIs as vs_rest', () => {
    expect(
      resolveComparison(
        rois([
          ['1', null],
          ['2', null],
        ])
      )?.mode
    ).toBe('vs_rest')
  })

  it('compares the alphabetically first group against the other in two_group mode', () => {
    const result = resolveComparison(
      rois([
        ['1', 'b'],
        ['2', 'A'],
        ['3', 'b'],
      ])
    )
    expect(result).toMatchObject({ mode: 'two_group', firstGroup: 'A', referenceGroup: 'b' })
  })

  it('sorts a labeled group before an unlabeled ROI and names the reference by ROI name', () => {
    const result = resolveComparison(
      rois([
        ['1', null],
        ['2', 'z'],
      ])
    )
    expect(result).toMatchObject({ firstGroup: 'z', referenceGroup: 'roi-1' })
  })

  it('drops excluded ROIs before grouping', () => {
    const result = resolveComparison(
      rois([
        ['1', 'a'],
        ['2', 'b'],
        ['3', 'c', false],
      ])
    )
    expect(result?.mode).toBe('two_group')
  })

  it('returns null with fewer than two groups', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'g'],
          ['2', 'g'],
        ])
      )
    ).toBeNull()
    expect(
      resolveComparison(
        rois([
          ['1', null],
          ['2', null, false],
        ])
      )
    ).toBeNull()
  })
})

describe('describeComparison', () => {
  it('describes each mode', () => {
    expect(
      describeComparison(
        resolveComparison(
          rois([
            ['1', 'a'],
            ['2', 'b'],
          ])
        )
      )
    ).toBe('Will compare: a vs b')
    expect(
      describeComparison(
        resolveComparison(
          rois([
            ['1', null],
            ['2', null],
            ['3', null],
          ])
        )
      )
    ).toBe('Will compare: each of 3 groups vs the rest')
    expect(describeComparison(null)).toContain('At least two groups')
  })
})

describe('targets and consistency', () => {
  it('lists only the scored group in two_group mode and every group in vs_rest', () => {
    expect(
      resolveComparison(
        rois([
          ['1', 'b'],
          ['2', 'a'],
          ['3', 'b'],
        ])
      )?.targets
    ).toEqual([{ roiId: '2', name: 'a' }])
    expect(
      resolveComparison(
        rois([
          ['1', 'g'],
          ['2', 'g'],
          ['3', null],
          ['4', null],
        ])
      )?.targets
    ).toEqual([
      { roiId: '1', name: 'g' },
      { roiId: '3', name: 'roi-3' },
      { roiId: '4', name: 'roi-4' },
    ])
  })

  it('formats consistency with a dash for singletons', () => {
    expect(formatConsistency(4, 3)).toBe('3/4 ROIs')
    expect(formatConsistency(1, null)).toBe('—')
    expect(formatConsistency(undefined, undefined)).toBe('—')
  })
})
