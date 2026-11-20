export interface RoiForComparison {
  id: string
  name: string
  groupLabel?: string | null
  includeInDiff?: boolean | null
}

export interface ExpectedDiffRow {
  roiId: string
  groupLabel: string | null
  referenceLabel: string | null
}

export interface ResolvedComparison {
  mode: 'vs_rest' | 'two_group'
  includedRoiIds: string[]
  expectedRows: ExpectedDiffRow[]
}

interface Group {
  label: string | null
  roiIds: string[]
  displayName: string
}

export const resolveComparison = (rois: RoiForComparison[]): ResolvedComparison => {
  const included = rois.filter(roi => roi.includeInDiff !== false)
  const groups = new Map<string, Group>()
  included.forEach((roi) => {
    const label = (roi.groupLabel || '').trim()
    const key = label ? `label:${label}` : `roi:${roi.id}`
    const group = groups.get(key) || { label: label || null, roiIds: [], displayName: label || roi.name }
    group.roiIds.push(roi.id)
    groups.set(key, group)
  })

  if (groups.size < 2) {
    throw new Error('At least two groups are required for a comparison')
  }

  const ordered = Array.from(groups.values()).sort((a, b) => {
    if ((a.label != null) !== (b.label != null)) {
      return a.label != null ? -1 : 1
    }
    const aLower = a.displayName.toLowerCase()
    const bLower = b.displayName.toLowerCase()
    if (aLower !== bLower) {
      return aLower < bLower ? -1 : 1
    }
    return a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0
  })

  const twoGroup = ordered.length === 2 && ordered.some(group => group.label != null)
  const targets = twoGroup ? ordered.slice(0, 1) : ordered
  const referenceLabel = twoGroup ? ordered[1].displayName : null

  return {
    mode: twoGroup ? 'two_group' : 'vs_rest',
    includedRoiIds: included.map(roi => roi.id),
    expectedRows: targets.flatMap(group => group.roiIds.map(roiId => ({
      roiId,
      groupLabel: group.label,
      referenceLabel,
    }))),
  }
}

export const expectedRowKeys = (rows: ExpectedDiffRow[]): Set<string> =>
  new Set(rows.map(row => JSON.stringify([String(row.roiId), row.groupLabel, row.referenceLabel])))

export const sameRowSets = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && Array.from(a).every(key => b.has(key))

/** One distinct (roi, group, reference, stored ROI set) combination of the existing `diff_roi` rows. */
export interface ExistingDiffRow extends ExpectedDiffRow {
  /** Included ROI ids of the run that wrote the row; null for rows written before the column existed. */
  comparisonRoiIds: string[] | null
}

/**
 * Whether the existing `diff_roi` rows are the result of exactly this comparison: same scored rows
 * (ROI, group, reference) and same included ROIs. The reference group of a two-group run has no rows,
 * so its membership is only visible through the stored ROI set.
 *
 * @param existing - Distinct existing rows of the ROIs in scope
 * @param comparison - The comparison about to run
 * @returns true when recalculating would reproduce the stored results
 *
 * @example
 * isSameComparison(distinctRows, resolveComparison(scopeRois)) // => true: skip the engine call
 */
export const isSameComparison = (existing: ExistingDiffRow[], comparison: ResolvedComparison): boolean => {
  if (!sameRowSets(expectedRowKeys(existing), expectedRowKeys(comparison.expectedRows))) {
    return false
  }
  const included = new Set(comparison.includedRoiIds.map(String))
  return existing.every(row => (row.comparisonRoiIds == null
    // Legacy rows: in vs_rest every included ROI has rows, so the row check above already covers the set
    ? comparison.mode === 'vs_rest'
    : sameRowSets(new Set(row.comparisonRoiIds.map(String)), included)))
}

export const roiToGraphql = (roi: any) => ({
  id: roi.id,
  datasetId: roi.datasetId,
  userId: roi.userId,
  name: roi.name,
  isDefault: roi.isDefault,
  geojson: JSON.stringify(roi.geojson),
  groupLabel: roi.groupLabel ?? null,
  includeInDiff: roi.includeInDiff !== false,
})

export interface DiffRowLike {
  annotationId: number
  roiId: string
  groupLabel: string | null
  lfc: number
  roiLfc: number | null
}

export interface CollapsedDiffRows<T extends DiffRowLike> {
  members: T[]
  nRois: number
  nConcordant: number | null
}

export const collapseDiffRows = <T extends DiffRowLike>(rows: T[]): CollapsedDiffRows<T>[] => {
  const byKey = new Map<string, T[]>()
  rows.forEach((row) => {
    const key = `${row.annotationId}|${row.groupLabel ?? `roi:${row.roiId}`}`
    const members = byKey.get(key)
    if (members) {
      members.push(row)
    } else {
      byKey.set(key, [row])
    }
  })
  return Array.from(byKey.values()).map((members) => {
    const pooled = members[0].lfc
    const nConcordant = members.length > 1
      ? members.filter(m => m.roiLfc != null && m.roiLfc !== 0 && Math.sign(m.roiLfc) === Math.sign(pooled)).length
      : null
    return { members, nRois: members.length, nConcordant }
  })
}

/** A result set of a differential analysis: one plain ROI, or one target group. */
export interface DiffRoiResultSet {
  /** Group label; null when the set is a single ungrouped ROI. */
  groupLabel: string | null
  /** Reference group label; non-null only for a two-group run. */
  referenceLabel: string | null
  /** ROIs that have rows in this set, ascending. */
  roiIds: string[]
  /** Reference group members of a two-group run, ascending; null otherwise or when the run did not store its ROIs. */
  referenceRoiIds: string[] | null
}

/** Ascending order for bigint ids held as decimal strings, without losing precision. */
const compareRoiIds = (a: string, b: string): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)

/**
 * Groups the distinct (roi, group, reference, stored ROI set) combinations of `diff_roi` into result
 * sets, with the same key as {@link collapseDiffRows}: the group label when present, otherwise the ROI.
 *
 * @param rows - Distinct existing rows of the ROIs in scope
 * @returns The result sets, ordered by their smallest ROI id
 *
 * @example
 * diffRoiResultSets([
 *   { roiId: '1', groupLabel: 'A', referenceLabel: 'B', comparisonRoiIds: ['1', '2', '3'] },
 *   { roiId: '2', groupLabel: 'A', referenceLabel: 'B', comparisonRoiIds: ['1', '2', '3'] },
 * ]) // => [{ groupLabel: 'A', referenceLabel: 'B', roiIds: ['1', '2'], referenceRoiIds: ['3'] }]
 */
export const diffRoiResultSets = (rows: ExistingDiffRow[]): DiffRoiResultSet[] => {
  const byKey = new Map<string, ExistingDiffRow[]>()
  rows.forEach((row) => {
    const key = row.groupLabel ?? `roi:${row.roiId}`
    const members = byKey.get(key)
    if (members) {
      members.push(row)
    } else {
      byKey.set(key, [row])
    }
  })

  return Array.from(byKey.values()).map((members) => {
    const roiIds = Array.from(new Set(members.map(row => String(row.roiId)))).sort(compareRoiIds)
    const referenceLabel = members.map(row => row.referenceLabel).find(label => label != null) ?? null
    const comparisonRoiIds = members.map(row => row.comparisonRoiIds).find(ids => ids != null) ?? null
    const targets = new Set(roiIds)
    return {
      groupLabel: members[0].groupLabel ?? null,
      referenceLabel,
      roiIds,
      referenceRoiIds: referenceLabel != null && comparisonRoiIds != null
        ? Array.from(new Set(comparisonRoiIds.map(String))).filter(id => !targets.has(id)).sort(compareRoiIds)
        : null,
    }
  }).sort((a, b) => compareRoiIds(a.roiIds[0], b.roiIds[0]))
}
