export interface RoiForComparison {
  id: string | null
  name: string
  groupLabel?: string | null
  includeInDiff?: boolean | null
}

export interface ResolvedComparison {
  mode: 'vs_rest' | 'two_group'
  groupCount: number
  firstGroup: string
  referenceGroup: string | null
  targets: Array<{ roiId: string | null; name: string }>
}

interface Group {
  label: string | null
  displayName: string
  firstRoiId: string | null
}

export const resolveComparison = (rois: RoiForComparison[]): ResolvedComparison | null => {
  const groups = new Map<string, Group>()
  rois.forEach((roi, index) => {
    if (roi.includeInDiff === false) {
      return
    }
    const label = (roi.groupLabel || '').trim()
    const key = label ? `label:${label}` : `roi:${roi.id ?? `new-${index}`}`
    if (!groups.has(key)) {
      groups.set(key, { label: label || null, displayName: label || roi.name, firstRoiId: roi.id })
    }
  })

  if (groups.size < 2) {
    return null
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

  const twoGroup = ordered.length === 2 && ordered.some((group) => group.label != null)
  return {
    mode: twoGroup ? 'two_group' : 'vs_rest',
    groupCount: ordered.length,
    firstGroup: ordered[0].displayName,
    referenceGroup: twoGroup ? ordered[1].displayName : null,
    targets: (twoGroup ? ordered.slice(0, 1) : ordered).map((group) => ({
      roiId: group.firstRoiId,
      name: group.displayName,
    })),
  }
}

export const describeComparison = (comparison: ResolvedComparison | null): string => {
  if (comparison == null) {
    return 'At least two groups must be included to compare.'
  }
  if (comparison.mode === 'two_group') {
    return `Will compare: ${comparison.firstGroup} vs ${comparison.referenceGroup}`
  }
  return `Will compare: each of ${comparison.groupCount} groups vs the rest`
}

export const formatConsistency = (nRois?: number | null, nConcordant?: number | null): string =>
  nRois != null && nRois > 1 && nConcordant != null ? `${nConcordant}/${nRois} ROIs` : '—'
