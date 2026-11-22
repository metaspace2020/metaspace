import { describe, it, expect } from 'vitest'
import { diffCsvCells, diffCsvHeader, diffTableColumns } from './DatasetDiffTable'

const COLUMNS = {
  annotation: { label: 'Annotation', src: 'annotation', selected: true },
  roiName: { label: 'ROI name', src: 'roiName', selected: true },
  consistency: { label: 'Consistency', src: 'consistency', selected: true },
  lfc: { label: 'LFC', src: 'lfc', selected: true },
}

const ROW = {
  roi: { id: '7', name: 'ROI 1' },
  groupLabel: 'Group A',
  nRois: 3,
  nConcordant: 2,
  lfc: 1.5,
  auc: 0.9,
  annotation: { sumFormula: 'C6H12O6', mz: 181.07, adduct: '+H', fdrLevel: 0.1, msmScore: 0.8, possibleCompounds: [] },
}

describe('DatasetDiffTable layout', () => {
  it('a plain run has the original columns: "ROI name" and no Consistency', () => {
    const columns = diffTableColumns(COLUMNS, false)
    expect(Object.keys(columns)).toEqual(['annotation', 'roiName', 'lfc'])
    expect(columns.roiName.label).toBe('ROI name')
  })

  it('a grouped run has a "Group" column followed by Consistency', () => {
    const columns = diffTableColumns(COLUMNS, true)
    expect(Object.keys(columns)).toEqual(['annotation', 'roiName', 'consistency', 'lfc'])
    expect(columns.roiName.label).toBe('Group')
    expect(COLUMNS.roiName.label).toBe('ROI name')
  })

  it('a plain run exports the original CSV layout', () => {
    expect(diffCsvHeader(false)).toEqual([
      'Annotation',
      'ROI Name',
      'LFC',
      'AUC',
      'm/z',
      'Adduct',
      'FDR',
      'MSM',
      'Molecules',
    ])
    const cells = diffCsvCells({ ...ROW, groupLabel: 'ROI 1', nRois: 1, nConcordant: null }, false)
    expect(cells).toHaveLength(diffCsvHeader(false).length)
    expect(cells.slice(0, 4)).toEqual(['C6H12O6', 'ROI 1', 1.5, 0.9])
  })

  it('a grouped run exports the group and its consistency', () => {
    expect(diffCsvHeader(true)).toEqual([
      'Annotation',
      'Group',
      'Consistency',
      'LFC',
      'AUC',
      'm/z',
      'Adduct',
      'FDR',
      'MSM',
      'Molecules',
    ])
    const cells = diffCsvCells(ROW, true)
    expect(cells).toHaveLength(diffCsvHeader(true).length)
    expect(cells.slice(0, 5)).toEqual(['C6H12O6', 'Group A', '2/3 ROIs', 1.5, 0.9])
  })
})
