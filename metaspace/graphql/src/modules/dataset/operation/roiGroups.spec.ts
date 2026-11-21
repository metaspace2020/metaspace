import { collapseDiffRows, expectedRowKeys, isSameComparison, resolveComparison, sameRowSets } from './roiGroups'

const rois = (spec: Array<[string, string | null, boolean?]>) =>
  spec.map(([id, groupLabel, includeInDiff]) => ({ id, name: `roi-${id}`, groupLabel, includeInDiff }))

describe('resolveComparison', () => {
  it('treats unlabeled ROIs as vs_rest singletons', () => {
    const result = resolveComparison(rois([['1', null], ['2', ' '], ['3', null]]))
    expect(result.mode).toBe('vs_rest')
    expect(result.expectedRows).toEqual([
      { roiId: '1', groupLabel: null, referenceLabel: null },
      { roiId: '2', groupLabel: null, referenceLabel: null },
      { roiId: '3', groupLabel: null, referenceLabel: null },
    ])
  })

  it('keeps two unlabeled ROIs as vs_rest', () => {
    expect(resolveComparison(rois([['1', null], ['2', null]])).mode).toBe('vs_rest')
  })

  it('scores only the alphabetically first group in two_group mode', () => {
    const result = resolveComparison(rois([['1', 'b'], ['2', 'A'], ['3', 'b']]))
    expect(result.mode).toBe('two_group')
    expect(result.expectedRows).toEqual([{ roiId: '2', groupLabel: 'A', referenceLabel: 'b' }])
  })

  it('sorts a labeled group before an unlabeled ROI and names the reference by ROI name', () => {
    const result = resolveComparison(rois([['1', null], ['2', 'z']]))
    expect(result.expectedRows).toEqual([{ roiId: '2', groupLabel: 'z', referenceLabel: 'roi-1' }])
  })

  it('drops excluded ROIs before grouping', () => {
    const result = resolveComparison(rois([['1', 'a'], ['2', 'b'], ['3', 'c', false]]))
    expect(result.mode).toBe('two_group')
    expect(result.includedRoiIds).toEqual(['1', '2'])
  })

  it('rejects fewer than two groups', () => {
    expect(() => resolveComparison(rois([['1', 'g'], ['2', 'g']]))).toThrow()
    expect(() => resolveComparison(rois([['1', null], ['2', null, false]]))).toThrow()
  })

  it('detects changed labels through the row sets', () => {
    const before = expectedRowKeys(resolveComparison(rois([['1', 'a'], ['2', 'b'], ['3', 'c']])).expectedRows)
    const same = expectedRowKeys(resolveComparison(rois([['1', 'a'], ['2', 'b'], ['3', 'c']])).expectedRows)
    const relabeled = expectedRowKeys(resolveComparison(rois([['1', 'a'], ['2', 'b'], ['3', 'd']])).expectedRows)
    expect(sameRowSets(before, same)).toBe(true)
    expect(sameRowSets(before, relabeled)).toBe(false)
  })
})

describe('isSameComparison', () => {
  type Spec = Array<[string, string | null, boolean?]>
  // The distinct rows a finished run of `spec` leaves in diff_roi (`stored` = false: rows from before the column)
  const rowsOfRun = (spec: Spec, stored = true) => {
    const run = resolveComparison(rois(spec))
    return run.expectedRows.map(row => ({ ...row, comparisonRoiIds: stored ? run.includedRoiIds : null }))
  }
  const same = (before: Spec, after: Spec, stored = true) =>
    isSameComparison(rowsOfRun(before, stored), resolveComparison(rois(after)))

  const twoGroup: Spec = [['1', 'A'], ['2', 'B'], ['3', 'B']]

  it('is true for an identical two-group comparison', () => {
    expect(same(twoGroup, twoGroup)).toBe(true)
  })

  it('detects a ROI removed from the reference group', () => {
    expect(same(twoGroup, [['1', 'A'], ['2', 'B'], ['3', null, false]])).toBe(false)
  })

  it('detects a ROI added to the reference group', () => {
    expect(same(twoGroup, [...twoGroup, ['4', 'B']])).toBe(false)
  })

  it('detects a changed target group', () => {
    expect(same(twoGroup, [['1', 'A'], ['2', 'A'], ['3', 'B']])).toBe(false)
    expect(same(twoGroup, [['1', 'A'], ['2', 'C'], ['3', 'C']])).toBe(false)
  })

  it('treats two-group rows without a stored ROI set as changed', () => {
    expect(same(twoGroup, twoGroup, false)).toBe(false)
  })

  it('falls back to the rows for vs_rest runs without a stored ROI set', () => {
    const vsRest: Spec = [['1', null], ['2', null], ['3', 'g'], ['4', 'g']]
    expect(same(vsRest, vsRest, false)).toBe(true)
    expect(same(vsRest, vsRest)).toBe(true)
    expect(same(vsRest, [...vsRest, ['5', null]], false)).toBe(false)
    expect(same(vsRest, [['1', null], ['2', null], ['3', 'g'], ['4', 'g', false]], false)).toBe(false)
  })

  it('compares ids regardless of order and of string/number type', () => {
    const comparison = resolveComparison(rois(twoGroup))
    const existing = [{ roiId: 1 as any, groupLabel: 'A', referenceLabel: 'B', comparisonRoiIds: [3, 1, 2] as any }]
    expect(isSameComparison(existing, comparison)).toBe(true)
  })
})

describe('collapseDiffRows', () => {
  const row = (roiId: string, groupLabel: string | null, roiLfc: number | null, annotationId = 1) =>
    ({ annotationId, roiId, groupLabel, lfc: 1.5, roiLfc })

  it('collapses members of a labeled group and counts concordant ROIs', () => {
    const [group] = collapseDiffRows([row('1', 'g', 2), row('2', 'g', -1), row('3', 'g', 0), row('4', 'g', 0.3)])
    expect(group.nRois).toBe(4)
    expect(group.nConcordant).toBe(2)
  })

  it('keeps unlabeled ROIs as singletons with null concordance', () => {
    const groups = collapseDiffRows([row('1', null, 1), row('2', null, 1)])
    expect(groups).toHaveLength(2)
    expect(groups.every(g => g.nRois === 1 && g.nConcordant === null)).toBe(true)
  })

  it('separates annotations', () => {
    expect(collapseDiffRows([row('1', 'g', 1, 1), row('1', 'g', 1, 2)])).toHaveLength(2)
  })
})
