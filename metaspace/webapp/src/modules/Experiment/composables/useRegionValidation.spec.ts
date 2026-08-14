import { describe, it, expect } from 'vitest'
import { isRegionValid, conditionCoverageWarning, singleReplicateWarning } from './useRegionValidation'
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

describe('singleReplicateWarning', () => {
  it('returns null when all conditions have ≥2 replicates', () => {
    const regions = [
      region({
        regionKey: 'r1',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({
        regionKey: 'r2',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm2' },
      }),
      region({ regionKey: 'r3', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: 'm1' } }),
      region({ regionKey: 'r4', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: 'm2' } }),
    ]
    expect(singleReplicateWarning(regions)).toBeNull()
  })

  it('warns when a condition has only one biological replicate', () => {
    const regions = [
      region({
        regionKey: 'r1',
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({ regionKey: 'r2', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: 'm1' } }),
    ]
    const w = singleReplicateWarning(regions)
    expect(w).not.toBeNull()
    expect(w!.affected).toHaveLength(2)
    expect(w!.affected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ condition: 'control', n: 1 }),
        expect.objectContaining({ condition: 'tumor', n: 1 }),
      ])
    )
    expect(w!.missingBioReps).toBe(false)
  })

  it('sets missingBioReps=true when no biologicalReplicateId is set anywhere', () => {
    const regions = [
      region({ regionKey: 'r1', metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: '' } }),
      region({ regionKey: 'r2', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: '' } }),
    ]
    const w = singleReplicateWarning(regions)
    expect(w).not.toBeNull()
    expect(w!.missingBioReps).toBe(true)
  })

  it('uses regionKey as fallback replicate id when biologicalReplicateId is blank', () => {
    // r1 and r2 are two distinct regions in the same condition — they count as n=2
    const regions = [
      region({ regionKey: 'r1', metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: '' } }),
      region({ regionKey: 'r2', metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: '' } }),
      region({ regionKey: 'r3', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: '' } }),
      region({ regionKey: 'r4', metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: '' } }),
    ]
    // Each condition has 2 distinct regionKeys → no warning
    expect(singleReplicateWarning(regions)).toBeNull()
  })

  it('ignores regions without a labelGroupName', () => {
    const regions = [
      region({
        regionKey: 'r1',
        labelGroupName: null,
        metadata: { ...region().metadata, condition: 'control', biologicalReplicateId: 'm1' },
      }),
      region({
        regionKey: 'r2',
        labelGroupName: null,
        metadata: { ...region().metadata, condition: 'tumor', biologicalReplicateId: 'm1' },
      }),
    ]
    // No label group assigned — should not warn
    expect(singleReplicateWarning(regions)).toBeNull()
  })

  it('returns null when no regions are included', () => {
    expect(singleReplicateWarning([])).toBeNull()
  })
})
