import gql from 'graphql-tag'

export const experimentsByProjectQuery = gql`
  query experimentsByProject($projectId: ID!) {
    experimentsByProject(projectId: $projectId) {
      id
      name
      description
      createdAt
      createdBy {
        id
        name
      }
      datasets {
        id
        dataset {
          id
          name
        }
      }
      run {
        status
        stage
        generation
      }
    }
  }
`

export const experimentQuery = gql`
  query experiment($id: ID!) {
    experiment(id: $id) {
      id
      name
      description
      matchMode
      createdAt
      project {
        id
        name
      }
      datasets {
        id
        regionSource
        dataset {
          id
          name
          polarity
        }
        regions {
          regionKey
          sourceKind
          roi {
            id
            name
          }
          segmentation {
            id
            segmentIndex
            name
          }
          labelGroupName
          metadata {
            condition
            biologicalReplicateId
            sampleId
            technicalReplicateId
            batchId
          }
        }
      }
      labelGroups {
        name
        color
      }
      run {
        status
        stage
        generation
        excludedSamples
        inferredTest
        filters
        error
        startedAt
        finishedAt
      }
    }
  }
`

// Mutations return the same Experiment shape as `experimentQuery` so Apollo's
// cache merge doesn't drop fields the active `experimentQuery` watcher relies
// on (e.g. nested `run.startedAt`/`excludedSamples`). Returning a partial shape
// causes the watcher's re-read to fail with "Cannot convert object to primitive value".
const EXPERIMENT_FIELDS = gql`
  fragment ExperimentFields on Experiment {
    id
    name
    description
    matchMode
    createdAt
    project {
      id
      name
    }
    datasets {
      id
      regionSource
      dataset {
        id
        name
        polarity
      }
      regions {
        regionKey
        sourceKind
        roi {
          id
          name
        }
        segmentation {
          id
          segmentIndex
          name
        }
        labelGroupName
        metadata {
          condition
          biologicalReplicateId
          sampleId
          technicalReplicateId
          batchId
        }
      }
    }
    labelGroups {
      name
      color
    }
    run {
      status
      stage
      generation
      excludedSamples
      inferredTest
      filters
      error
      startedAt
      finishedAt
    }
  }
`

export const createExperimentMutation = gql`
  mutation createExperiment($projectId: ID!, $input: ExperimentInput!) {
    createExperiment(projectId: $projectId, input: $input) {
      ...ExperimentFields
    }
  }
  ${EXPERIMENT_FIELDS}
`

export const updateExperimentMutation = gql`
  mutation updateExperiment($id: ID!, $input: ExperimentInput!) {
    updateExperiment(id: $id, input: $input) {
      ...ExperimentFields
    }
  }
  ${EXPERIMENT_FIELDS}
`

export const deleteExperimentMutation = gql`
  mutation deleteExperiment($id: ID!) {
    deleteExperiment(id: $id)
  }
`

export const runExperimentPrepMutation = gql`
  mutation runExperimentPrep($id: ID!) {
    runExperimentPrep(id: $id) {
      ...ExperimentFields
    }
  }
  ${EXPERIMENT_FIELDS}
`

export const runExperimentStatsMutation = gql`
  mutation runExperimentStats($id: ID!, $filter: ExperimentResultsFilter!, $excludedSamples: [String!]!) {
    runExperimentStats(id: $id, filter: $filter, excludedSamples: $excludedSamples) {
      ...ExperimentFields
    }
  }
  ${EXPERIMENT_FIELDS}
`

export const experimentResultsQuery = gql`
  query experimentResults(
    $experimentId: ID!
    $filter: ExperimentResultsFilter
    $orderBy: String
    $limit: Int
    $offset: Int
  ) {
    experimentResults(experimentId: $experimentId, filter: $filter, orderBy: $orderBy, limit: $limit, offset: $offset) {
      ion {
        id
        ion
        formula
        adduct
      }
      labelGroupName
      condA
      condB
      lfc
      pValue
      fdr
      nA
      nB
      meanA
      meanB
      detectionRateA
      detectionRateB
    }
  }
`

export const experimentIonIntensitiesQuery = gql`
  query experimentIonIntensities($experimentId: ID!, $ionId: Int!) {
    experimentIonIntensities(experimentId: $experimentId, ionId: $ionId) {
      regionKey
      intensity
      condition
      sampleId
      biologicalReplicateId
    }
  }
`

export const experimentRunQcQuery = gql`
  query experimentRunQc($experimentId: ID!) {
    experimentRunQc(experimentId: $experimentId)
  }
`

export const updateExperimentExcludedSamplesMutation = gql`
  mutation updateExperimentExcludedSamples($experimentId: ID!, $excludedSamples: [String!]!) {
    updateExperimentExcludedSamples(experimentId: $experimentId, excludedSamples: $excludedSamples) {
      ...ExperimentFields
    }
  }
  ${EXPERIMENT_FIELDS}
`

export const experimentRunStatusQuery = gql`
  query experimentRunStatus($id: ID!) {
    experiment(id: $id) {
      id
      name
      project {
        id
      }
      labelGroups {
        name
      }
      datasets {
        dataset {
          id
          name
        }
        regions {
          metadata {
            sampleId
            condition
          }
        }
      }
      run {
        status
        stage
        generation
        error
        inferredTest
        filters
        excludedSamples
        startedAt
        finishedAt
      }
    }
  }
`

/**
 * Project-level candidate datasets. Limited to id/name/polarity intentionally:
 * ROIs and segmentations are not fields of the Dataset graphql type. They are
 * fetched lazily per-dataset via `rois(datasetId)` / `segmentations(datasetId)`
 * when the user picks a non-WHOLE region source.
 */
export const projectCandidateDatasetsQuery = gql`
  query projectCandidateDatasets($projectId: ID!) {
    allDatasets(filter: { project: $projectId }, limit: 500) {
      id
      name
      polarity
    }
  }
`

export const datasetIonImagePreviewQuery = gql`
  query datasetIonImagePreview($datasetId: String!) {
    dataset(id: $datasetId) {
      id
      ionThumbnailUrl
      acquisitionGeometry
      opticalImages(type: CLIPPED_TO_ION_IMAGE) {
        id
        url
        transform
      }
    }
  }
`

export const datasetRoisQuery = gql`
  query datasetRois($datasetId: String!) {
    rois(datasetId: $datasetId) {
      id
      name
      isDefault
      geojson
    }
  }
`

export const datasetSegmentationsQuery = gql`
  query datasetSegmentations($datasetId: String!) {
    segmentations(datasetId: $datasetId) {
      id
      segmentIndex
      name
      stale
    }
  }
`

/** A single sample's metadata row in a draft. */
export interface ExperimentDraftRegion {
  regionKey: string
  sourceKind: 'roi' | 'segmentation_cluster' | 'whole'
  roiId: number | null
  segmentationId: string | null
  labelGroupName: string | null
  included: boolean
  metadata: {
    condition: string
    biologicalReplicateId: string
    sampleId: string
    technicalReplicateId: string | null
    batchId: string | null
  }
}

/** Per-dataset draft. */
export interface ExperimentDraftDataset {
  datasetId: string
  regionSource: 'ROI' | 'SEGMENTATION' | 'WHOLE'
  regions: ExperimentDraftRegion[]
}

/** Top-level draft persisted by the editor. */
export interface ExperimentDraft {
  name: string
  description: string | null
  matchMode: 'COLOR' | 'MANUAL' | 'NAME' | 'GROUP'
  datasets: ExperimentDraftDataset[]
  labelGroups: { name: string; color: string }[]
}

/** Deterministic palette used for auto-generated label-group colors and fallback region swatches. */
export const REGION_PALETTE: readonly string[] = ['#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#ff7f0e'] as const

/** Pick a deterministic color from REGION_PALETTE for an integer index (cycles). */
export const paletteColor = (index: number): string =>
  REGION_PALETTE[((index % REGION_PALETTE.length) + REGION_PALETTE.length) % REGION_PALETTE.length]

/**
 * Compute a human-readable label for a region given its source-kind context.
 * Shared between DatasetMetadataCard and ExperimentEditPage so labels stay consistent.
 */
export const regionLabel = (
  r: ExperimentDraftRegion,
  rois: { id: string; name: string }[],
  segmentations: { id: string; segmentIndex: number; name: string | null }[]
): string => {
  if (r.sourceKind === 'whole') return 'Whole dataset'
  if (r.sourceKind === 'roi') {
    const roi = rois.find((x) => Number(x.id) === r.roiId)
    return roi ? `ROI: ${roi.name}` : `ROI #${r.roiId ?? '?'}`
  }
  const seg = segmentations.find((s) => s.id === r.segmentationId)
  return seg ? `Cluster #${seg.segmentIndex}${seg.name ? ` ${seg.name}` : ''}` : 'Cluster'
}

/**
 * Generate a stable region key. Uses crypto.randomUUID when available, otherwise
 * falls back to a deterministic hash from the dataset+source identifiers.
 */
export const generateRegionKey = (
  datasetId?: string | null,
  region?: {
    sourceKind?: string | null
    roi?: { id?: number | string | null } | null
    roiId?: number | null
    segmentation?: { id?: string | null } | null
    segmentationId?: string | null
  } | null
): string => {
  const cryptoObj = (typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined) as
    | { randomUUID?: () => string }
    | undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  const sourceKind = region?.sourceKind ?? 'whole'
  const roiId = region?.roi?.id ?? region?.roiId ?? null
  const segId = region?.segmentation?.id ?? region?.segmentationId ?? null
  return `${datasetId ?? 'ds'}-${sourceKind}-${roiId ?? segId ?? 'whole'}-${Math.random().toString(36).slice(2, 10)}`
}

export const emptyDraft = (): ExperimentDraft => ({
  name: '',
  description: null,
  matchMode: 'NAME',
  datasets: [],
  labelGroups: [],
})

/** Hydrate a draft from a server-shaped Experiment payload. */
export const draftFromExperiment = (exp: any): ExperimentDraft => ({
  name: exp.name,
  description: exp.description ?? null,
  matchMode:
    exp.matchMode === 'MANUAL' || exp.matchMode === 'GROUP' ? 'MANUAL' : exp.matchMode === 'COLOR' ? 'COLOR' : 'NAME',
  datasets: (exp.datasets ?? []).map((d: any) => ({
    datasetId: d.dataset.id,
    regionSource: d.regionSource,
    regions: (d.regions ?? []).map((r: any) => ({
      regionKey: r.regionKey ?? generateRegionKey(d.dataset?.id, r),
      sourceKind: r.sourceKind,
      roiId: r.roi?.id != null ? Number(r.roi.id) : null,
      segmentationId: r.segmentation?.id ?? null,
      labelGroupName: r.labelGroupName ?? null,
      included: r.included ?? true,
      metadata: {
        condition: r.metadata?.condition ?? '',
        biologicalReplicateId: r.metadata?.biologicalReplicateId ?? '',
        sampleId: r.metadata?.sampleId ?? '',
        technicalReplicateId: r.metadata?.technicalReplicateId ?? null,
        batchId: r.metadata?.batchId ?? null,
      },
    })),
  })),
  labelGroups: (exp.labelGroups ?? []).map((lg: any) => ({ name: lg.name, color: lg.color })),
})

/** Serialize a draft to the `ExperimentInput` shape expected by graphql. */
export const serializeDraft = (
  d: ExperimentDraft
): {
  name: string
  description: string | null
  matchMode: 'NAME' | 'MANUAL'
  datasets: Array<{
    datasetId: string
    regionSource: 'ROI' | 'SEGMENTATION' | 'WHOLE'
    regions: Array<{
      regionKey: string
      sourceKind: string
      roiId: number | null
      segmentationId: string | null
      labelGroupName: string | null
      metadata: ExperimentDraftRegion['metadata']
    }>
  }>
  labelGroups: { name: string; color: string }[]
} => ({
  name: d.name,
  description: d.description,
  // TODO: backend currently lacks COLOR/GROUP enum values
  matchMode: d.matchMode === 'COLOR' ? 'MANUAL' : d.matchMode === 'GROUP' ? 'NAME' : d.matchMode,
  datasets: d.datasets.map((ds) => ({
    datasetId: ds.datasetId,
    regionSource: ds.regionSource,
    regions: ds.regions
      .filter((r) => r.included !== false)
      .map((r) => ({
        regionKey: r.regionKey ?? generateRegionKey(ds.datasetId, r),
        sourceKind: r.sourceKind,
        roiId: r.roiId != null ? Number(r.roiId) : null,
        segmentationId: r.segmentationId,
        labelGroupName: r.labelGroupName,
        metadata: {
          ...r.metadata,
          sampleId: r.metadata.sampleId?.trim() || ds.datasetId,
        },
      })),
  })),
  labelGroups: (() => {
    const used = new Set<string>()
    for (const ds of d.datasets) {
      for (const r of ds.regions) {
        if (r.included !== false && r.labelGroupName) used.add(r.labelGroupName)
      }
    }
    return d.labelGroups.filter((lg) => used.has(lg.name)).map((lg) => ({ name: lg.name, color: lg.color }))
  })(),
})
