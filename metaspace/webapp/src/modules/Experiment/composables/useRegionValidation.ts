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

export interface SingleReplicateWarning {
  /** Per (label group, condition) pairs where effective replicate count < 2. */
  affected: Array<{ labelGroup: string; condition: string; n: number }>
  /** True when no region has a biologicalReplicateId — softer informational note. */
  missingBioReps: boolean
}

/**
 * Warns when any (labelGroup, condition) pair has fewer than 2 effective replicates.
 * "Effective replicates" = distinct biologicalReplicateId values, or the regionKey
 * when biologicalReplicateId is absent (matching the backend's aggregation logic).
 * Only considers regions that have a labelGroupName assigned.
 */
export function singleReplicateWarning(regions: ExperimentDraftRegion[]): SingleReplicateWarning | null {
  const included = regions.filter((r) => r.included !== false && r.labelGroupName)
  if (included.length === 0) return null

  const anyBioRep = included.some((r) => r.metadata.biologicalReplicateId?.trim())

  // Map (labelGroupName + condition) → set of effective replicate identifiers.
  const groups = new Map<string, Set<string>>()
  for (const r of included) {
    const lg = r.labelGroupName!
    const cond = r.metadata.condition?.trim()
    if (!cond) continue
    const key = `${lg}\0${cond}`
    if (!groups.has(key)) groups.set(key, new Set())
    const repId = r.metadata.biologicalReplicateId?.trim() || r.regionKey
    groups.get(key)!.add(repId)
  }

  const affected: SingleReplicateWarning['affected'] = []
  for (const [key, ids] of groups) {
    if (ids.size < 2) {
      const sep = key.indexOf('\0')
      affected.push({ labelGroup: key.slice(0, sep), condition: key.slice(sep + 1), n: ids.size })
    }
  }

  if (affected.length === 0) return null
  return { affected, missingBioReps: !anyBioRep }
}
