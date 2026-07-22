export interface SeedDataset<R> {
  datasetId: string
  regions: R[]
}
export interface SeedRegion {
  regionKey: string
  labelGroupName: string | null
}
export interface SeedLabelGroup {
  name: string
  color: string
}

export const seedNameModeGroups = <R extends SeedRegion>(args: {
  datasets: SeedDataset<R>[]
  labelGroups: SeedLabelGroup[]
  labelOf: (r: R) => string
  palette: string[]
}): { datasets: SeedDataset<R>[]; labelGroups: SeedLabelGroup[] } => {
  const { datasets, labelGroups, labelOf, palette } = args

  const ungroupedByLabel = new Map<string, { dsIdx: number; regionKey: string }[]>()
  datasets.forEach((ds, dsIdx) => {
    for (const r of ds.regions) {
      if (r.labelGroupName != null) continue
      const lbl = labelOf(r)
      if (!ungroupedByLabel.has(lbl)) ungroupedByLabel.set(lbl, [])
      ungroupedByLabel.get(lbl)!.push({ dsIdx, regionKey: r.regionKey })
    }
  })

  let nextLabelGroups = labelGroups.slice()
  const nextDatasets: SeedDataset<R>[] = datasets.map((ds) => ({ ...ds, regions: ds.regions.slice() }))

  for (const [label, members] of ungroupedByLabel) {
    const distinctDatasets = new Set(members.map((m) => m.dsIdx))
    if (distinctDatasets.size < 2) continue
    const finalName = resolveRenameTarget(
      label,
      nextLabelGroups.map((g) => g.name)
    )
    const color = palette[nextLabelGroups.length % palette.length]
    nextLabelGroups = [...nextLabelGroups, { name: finalName, color }]
    const seenDs = new Set<number>()
    for (const m of members) {
      if (seenDs.has(m.dsIdx)) continue
      seenDs.add(m.dsIdx)
      nextDatasets[m.dsIdx].regions = nextDatasets[m.dsIdx].regions.map((r) =>
        r.regionKey === m.regionKey ? ({ ...r, labelGroupName: finalName } as R) : r
      )
    }
  }

  return { datasets: nextDatasets, labelGroups: nextLabelGroups }
}

export const resolveRenameTarget = (typed: string, existingNames: string[]): string => {
  const used = new Set(existingNames)
  if (!used.has(typed)) return typed
  let n = 2
  while (used.has(`${typed} ${n}`)) n++
  return `${typed} ${n}`
}
