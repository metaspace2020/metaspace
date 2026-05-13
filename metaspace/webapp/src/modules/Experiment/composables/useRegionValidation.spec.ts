import { describe, it, expect } from 'vitest'
import { isRegionValid, conditionCoverageWarning } from './useRegionValidation'
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

describe('conditionCoverageWarning', () => {
  it('warns when the whole experiment has only one condition', () => {
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
    expect(conditionCoverageWarning(regions)).toEqual({ conditions: ['control'] })
  })

  it('does not warn ≥2 conditions exist across experiment, even if label is single-condition', () => {
    // design1.csv scenario #8: matched replicates clustered per condition in separate groups.
    const regions = [
      region({
        regionKey: 'a',
        labelGroupName: 'control_group',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({
        regionKey: 'b',
        labelGroupName: 'control_group',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm2' },
      }),
      region({
        regionKey: 'c',
        labelGroupName: 'treated_group',
        metadata: { ...region().metadata, condition: 'nash', biologicalReplicateId: 'm3' },
      }),
      region({
        regionKey: 'd',
        labelGroupName: 'treated_group',
        metadata: { ...region().metadata, condition: 'nash', biologicalReplicateId: 'm4' },
      }),
    ]
    expect(conditionCoverageWarning(regions)).toBeNull()
  })

  it('warns with empty conditions when no region has a condition set', () => {
    const regions = [region({ metadata: { ...region().metadata, condition: '' } })]
    expect(conditionCoverageWarning(regions)).toEqual({ conditions: [] })
  })
})
