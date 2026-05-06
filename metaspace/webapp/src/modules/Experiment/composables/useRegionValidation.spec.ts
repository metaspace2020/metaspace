import { describe, it, expect } from 'vitest'
import { isRegionValid, oneConditionGroupWarnings } from './useRegionValidation'
import type { ExperimentDraftRegion } from '../api'

const region = (over: Partial<ExperimentDraftRegion> = {}): ExperimentDraftRegion => ({
  regionKey: 'r',
  sourceKind: 'roi',
  roiId: 1,
  segmentationId: null,
  labelGroupName: 'g1',
  metadata: {
    condition: 'control',
    biologicalReplicateId: 'm1',
    sampleId: 's1',
    technicalReplicateId: null,
    batchId: null,
  },
  ...over,
})

describe('isRegionValid', () => {
  it('requires condition', () => {
    expect(isRegionValid(region({ metadata: { ...region().metadata, condition: '' } }))).toEqual({
      ok: false,
      missing: ['condition'],
    })
  })

  it('requires biologicalReplicateId', () => {
    expect(isRegionValid(region({ metadata: { ...region().metadata, biologicalReplicateId: '' } }))).toEqual({
      ok: false,
      missing: ['biologicalReplicateId'],
    })
  })

  it('passes when condition + bio rep set; sampleId may be blank', () => {
    expect(isRegionValid(region({ metadata: { ...region().metadata, sampleId: '' } }))).toEqual({
      ok: true,
      missing: [],
    })
  })
})

describe('oneConditionGroupWarnings', () => {
  it('warns when a label group has only one distinct condition', () => {
    const regions = [
      region({
        regionKey: 'a',
        labelGroupName: 'g1',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({
        regionKey: 'b',
        labelGroupName: 'g1',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm2' },
      }),
    ]
    expect(oneConditionGroupWarnings(regions)).toEqual([{ labelGroupName: 'g1', conditions: ['control'] }])
  })

  it('does not warn when there are 2+ conditions', () => {
    const regions = [
      region({
        regionKey: 'a',
        labelGroupName: 'g1',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({
        regionKey: 'b',
        labelGroupName: 'g1',
        metadata: { ...region().metadata, condition: 'treated', biologicalReplicateId: 'm2' },
      }),
    ]
    expect(oneConditionGroupWarnings(regions)).toEqual([])
  })

  it('ignores regions with no labelGroupName', () => {
    const regions = [region({ labelGroupName: null })]
    expect(oneConditionGroupWarnings(regions)).toEqual([])
  })
})
