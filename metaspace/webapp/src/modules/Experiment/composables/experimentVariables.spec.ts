import { describe, it, expect } from 'vitest'
import {
  emptyVariables,
  seedVariablesFromDraft,
  mergeVariables,
  addVariableValue,
  removeVariableValue,
  assignVariableToDatasets,
  datasetSummary,
  isDatasetFullyAssigned,
  variableUsageCount,
} from './experimentVariables'
import type { ExperimentDraft, ExperimentDraftDataset, ExperimentDraftRegion } from '../api'

const region = (over: Partial<ExperimentDraftRegion> = {}): ExperimentDraftRegion => ({
  regionKey: 'r',
  sourceKind: 'whole',
  roiId: null,
  segmentationId: null,
  labelGroupName: null,
  included: true,
  metadata: {
    condition: 'Cond2',
    biologicalReplicateId: 'A3',
    sampleId: 's1',
    technicalReplicateId: 'S1',
    batchId: null,
  },
  ...over,
})

const dataset = (over: Partial<ExperimentDraftDataset> = {}): ExperimentDraftDataset => ({
  datasetId: 'd1',
  regionSource: 'WHOLE',
  regions: [region()],
  ...over,
})

const draft = (datasets: ExperimentDraftDataset[]): ExperimentDraft => ({
  name: 'X',
  description: null,
  matchMode: 'NAME',
  labelGroups: [],
  datasets,
})

describe('seedVariablesFromDraft', () => {
  it('collects distinct values in first-seen order, skipping empty/null', () => {
    const d = draft([
      dataset({
        datasetId: 'd1',
        regions: [
          region({
            metadata: {
              condition: 'Cond2',
              biologicalReplicateId: 'A3',
              sampleId: 's1',
              technicalReplicateId: 'S1',
              batchId: null,
            },
          }),
          region({
            metadata: {
              condition: 'Cond1',
              biologicalReplicateId: 'A3',
              sampleId: 's2',
              technicalReplicateId: 'S2',
              batchId: 'b1',
            },
          }),
        ],
      }),
    ])
    expect(seedVariablesFromDraft(d)).toEqual({
      condition: ['Cond2', 'Cond1'],
      biologicalReplicateId: ['A3'],
      batchId: ['b1'],
      technicalReplicateId: ['S1', 'S2'],
    })
  })

  it('returns empty lists for an empty draft', () => {
    expect(seedVariablesFromDraft(draft([]))).toEqual(emptyVariables())
  })
})

describe('mergeVariables', () => {
  it('unions per key, preserving a-order then b-extras, deduped', () => {
    const a = { condition: ['Cond2'], biologicalReplicateId: [], batchId: [], technicalReplicateId: [] }
    const b = { condition: ['Cond2', 'Cond1'], biologicalReplicateId: ['A3'], batchId: [], technicalReplicateId: [] }
    expect(mergeVariables(a, b)).toEqual({
      condition: ['Cond2', 'Cond1'],
      biologicalReplicateId: ['A3'],
      batchId: [],
      technicalReplicateId: [],
    })
  })
})

describe('add/removeVariableValue', () => {
  it('adds a new value once, ignores blanks and duplicates', () => {
    let v = emptyVariables()
    v = addVariableValue(v, 'condition', 'Cond1')
    v = addVariableValue(v, 'condition', 'Cond1')
    v = addVariableValue(v, 'condition', '')
    expect(v.condition).toEqual(['Cond1'])
  })

  it('removes a value', () => {
    const v = { condition: ['Cond1', 'Cond2'], biologicalReplicateId: [], batchId: [], technicalReplicateId: [] }
    expect(removeVariableValue(v, 'condition', 'Cond1').condition).toEqual(['Cond2'])
  })
})

describe('assignVariableToDatasets', () => {
  it('sets the value on every region of the targeted datasets only', () => {
    const d = draft([
      dataset({ datasetId: 'd1', regions: [region({ regionKey: 'a' })] }),
      dataset({
        datasetId: 'd2',
        regions: [region({ regionKey: 'b' }), region({ regionKey: 'c' })],
      }),
    ])
    const next = assignVariableToDatasets(d, ['d2'], 'condition', 'Cond1')
    expect(next.datasets[0].regions[0].metadata.condition).toBe('Cond2') // d1 untouched
    expect(next.datasets[1].regions.map((r) => r.metadata.condition)).toEqual(['Cond1', 'Cond1'])
  })

  it('stores empty optional values as null', () => {
    const d = draft([dataset({ datasetId: 'd1', regions: [region()] })])
    const next = assignVariableToDatasets(d, ['d1'], 'batchId', '')
    expect(next.datasets[0].regions[0].metadata.batchId).toBeNull()
  })

  it('does not mutate the input draft', () => {
    const d = draft([dataset({ datasetId: 'd1', regions: [region()] })])
    assignVariableToDatasets(d, ['d1'], 'condition', 'Cond1')
    expect(d.datasets[0].regions[0].metadata.condition).toBe('Cond2')
  })
})

describe('datasetSummary', () => {
  it('returns the shared value, or mixed when regions differ, or null when unset', () => {
    const ds = dataset({
      regions: [
        region({
          metadata: {
            condition: 'Cond2',
            biologicalReplicateId: 'A3',
            sampleId: 's1',
            technicalReplicateId: 'S1',
            batchId: null,
          },
        }),
        region({
          metadata: {
            condition: 'Cond1',
            biologicalReplicateId: 'A3',
            sampleId: 's2',
            technicalReplicateId: 'S1',
            batchId: null,
          },
        }),
      ],
    })
    expect(datasetSummary(ds)).toEqual({
      condition: 'mixed',
      biologicalReplicateId: 'A3',
      technicalReplicateId: 'S1',
      batchId: null,
    })
  })
})

describe('isDatasetFullyAssigned', () => {
  it('is true only when every region has condition + bio rep', () => {
    expect(isDatasetFullyAssigned(dataset({ regions: [region()] }))).toBe(true)
    expect(
      isDatasetFullyAssigned(
        dataset({
          regions: [
            region({
              metadata: {
                condition: '',
                biologicalReplicateId: 'A3',
                sampleId: '',
                technicalReplicateId: null,
                batchId: null,
              },
            }),
          ],
        })
      )
    ).toBe(false)
  })
})

describe('variableUsageCount', () => {
  it('counts regions currently using a value', () => {
    const d = draft([
      dataset({ datasetId: 'd1', regions: [region({ regionKey: 'a' }), region({ regionKey: 'b' })] }),
      dataset({
        datasetId: 'd2',
        regions: [
          region({
            regionKey: 'c',
            metadata: {
              condition: 'Cond1',
              biologicalReplicateId: 'A3',
              sampleId: '',
              technicalReplicateId: null,
              batchId: null,
            },
          }),
        ],
      }),
    ])
    expect(variableUsageCount(d, 'condition', 'Cond2')).toBe(2)
    expect(variableUsageCount(d, 'condition', 'Cond1')).toBe(1)
  })
})
