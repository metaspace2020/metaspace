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

export interface ConditionCoverageWarning {
  conditions: string[]
}

/**
 * A statistical test needs ≥2 distinct conditions somewhere across the included regions.
 * The engine (stats_analysis/runner.py) first tries per-label-group inference and, if every
 * group lands on NOT_ENOUGH_DATA, falls back to an experiment-wide test pooling all
 * LG-assigned regions. So a single-condition label group is fine as long as the experiment
 * as a whole has ≥2 conditions; only flag when even that pool is single-condition.
 */
export function conditionCoverageWarning(regions: ExperimentDraftRegion[]): ConditionCoverageWarning | null {
  const conditions = new Set<string>()
  for (const r of regions) {
    const cond = r.metadata.condition?.trim()
    if (cond) conditions.add(cond)
  }
  if (conditions.size >= 2) return null
  return { conditions: [...conditions] }
}
