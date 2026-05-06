import type { ExperimentDraftRegion } from '../api'

export interface RegionValidity {
  ok: boolean
  missing: Array<'condition' | 'biologicalReplicateId'>
}

export function isRegionValid(region: ExperimentDraftRegion): RegionValidity {
  const missing: RegionValidity['missing'] = []
  if (!region.metadata.condition?.trim()) missing.push('condition')
  if (!region.metadata.biologicalReplicateId?.trim()) missing.push('biologicalReplicateId')
  return { ok: missing.length === 0, missing }
}

export interface OneConditionWarning {
  labelGroupName: string
  conditions: string[]
}

export function oneConditionGroupWarnings(regions: ExperimentDraftRegion[]): OneConditionWarning[] {
  const byGroup = new Map<string, Set<string>>()
  for (const r of regions) {
    if (!r.labelGroupName) continue
    const cond = r.metadata.condition?.trim()
    if (!cond) continue
    if (!byGroup.has(r.labelGroupName)) byGroup.set(r.labelGroupName, new Set())
    byGroup.get(r.labelGroupName)!.add(cond)
  }
  const out: OneConditionWarning[] = []
  for (const [labelGroupName, set] of byGroup) {
    if (set.size === 1) out.push({ labelGroupName, conditions: [...set] })
  }
  return out
}
