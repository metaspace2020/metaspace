import type { ExperimentDraft, ExperimentDraftDataset } from '../api'

export type VariableKey = 'condition' | 'biologicalReplicateId' | 'batchId' | 'technicalReplicateId'

export type ExperimentVariables = Record<VariableKey, string[]>

export const VARIABLE_KEYS: VariableKey[] = ['condition', 'biologicalReplicateId', 'technicalReplicateId', 'batchId']

export const REQUIRED_VARIABLE_KEYS: VariableKey[] = ['condition', 'biologicalReplicateId']

export const OPTIONAL_VARIABLE_KEYS: VariableKey[] = ['batchId', 'technicalReplicateId']

export const VARIABLE_LABELS: Record<VariableKey, string> = {
  condition: 'Condition',
  biologicalReplicateId: 'Biological replicate',
  technicalReplicateId: 'Technical replicate',
  batchId: 'Batch',
}

export const emptyVariables = (): ExperimentVariables => ({
  condition: [],
  biologicalReplicateId: [],
  batchId: [],
  technicalReplicateId: [],
})

/** Normalise a metadata value to a non-empty string or null. */
const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/** Distinct non-empty values per field, in first-seen order across all regions. */
export const seedVariablesFromDraft = (draft: ExperimentDraft): ExperimentVariables => {
  const out = emptyVariables()
  const push = (key: VariableKey, value: string | null): void => {
    if (value != null && !out[key].includes(value)) out[key].push(value)
  }
  for (const ds of draft.datasets) {
    for (const r of ds.regions) {
      push('condition', clean(r.metadata.condition))
      push('biologicalReplicateId', clean(r.metadata.biologicalReplicateId))
      push('technicalReplicateId', clean(r.metadata.technicalReplicateId))
      push('batchId', clean(r.metadata.batchId))
    }
  }
  return out
}

/** Union per key: a's values first (in order), then b's extras. */
export const mergeVariables = (a: ExperimentVariables, b: ExperimentVariables): ExperimentVariables => {
  const out = emptyVariables()
  for (const key of VARIABLE_KEYS) {
    out[key] = [...a[key], ...b[key].filter((v) => !a[key].includes(v))]
  }
  return out
}

export const addVariableValue = (vars: ExperimentVariables, key: VariableKey, value: string): ExperimentVariables => {
  const v = value.trim()
  if (v === '' || vars[key].includes(v)) return vars
  return { ...vars, [key]: [...vars[key], v] }
}

export const removeVariableValue = (
  vars: ExperimentVariables,
  key: VariableKey,
  value: string
): ExperimentVariables => ({
  ...vars,
  [key]: vars[key].filter((v) => v !== value),
})

/** Optional fields store '' as null; required fields store the raw string. */
const storedValue = (key: VariableKey, value: string): string | null =>
  OPTIONAL_VARIABLE_KEYS.includes(key) ? (value.trim() === '' ? null : value) : value

export const assignVariableToDatasets = (
  draft: ExperimentDraft,
  datasetIds: string[],
  key: VariableKey,
  value: string
): ExperimentDraft => {
  const ids = new Set(datasetIds)
  const stored = storedValue(key, value)
  return {
    ...draft,
    datasets: draft.datasets.map((ds) =>
      ids.has(ds.datasetId)
        ? { ...ds, regions: ds.regions.map((r) => ({ ...r, metadata: { ...r.metadata, [key]: stored } })) }
        : ds
    ),
  }
}

/** Collapse a dataset's regions to one value per field: the shared value, 'mixed', or null. */
export const datasetSummary = (dataset: ExperimentDraftDataset): Record<VariableKey, string | null> => {
  const out: Record<VariableKey, string | null> = {
    condition: null,
    biologicalReplicateId: null,
    technicalReplicateId: null,
    batchId: null,
  }
  for (const key of VARIABLE_KEYS) {
    const distinct = new Set<string>()
    for (const r of dataset.regions) {
      const v = clean(r.metadata[key] as string | null)
      if (v != null) distinct.add(v)
    }
    if (distinct.size === 0) out[key] = null
    else if (distinct.size === 1) out[key] = [...distinct][0]
    else out[key] = 'mixed'
  }
  return out
}

export const isDatasetFullyAssigned = (dataset: ExperimentDraftDataset): boolean =>
  dataset.regions.length > 0 &&
  dataset.regions.every((r) => clean(r.metadata.condition) != null && clean(r.metadata.biologicalReplicateId) != null)

export const variableUsageCount = (draft: ExperimentDraft, key: VariableKey, value: string): number => {
  let n = 0
  for (const ds of draft.datasets) {
    for (const r of ds.regions) {
      if ((r.metadata[key] as string | null) === value) n++
    }
  }
  return n
}
