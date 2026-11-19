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
