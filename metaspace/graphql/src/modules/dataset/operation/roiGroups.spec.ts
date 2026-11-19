import { collapseDiffRows, expectedRowKeys, resolveComparison, sameRowSets } from './roiGroups'

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
