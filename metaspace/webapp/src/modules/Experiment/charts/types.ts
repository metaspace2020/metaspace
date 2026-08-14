export interface QcSampleRow {
  regionKey: string
  sampleId: string
  condition: string | null
  tic: number
  detectionRate: number
  cv: number
  pcaPC1: number
  pcaPC2: number
}

export interface FilterChainStep {
  name: string
  count: number
  droppedFromPrev: number | null
}

export type CoverageMap = Record<string, { detected: number; total: number }>

export interface AllIonRow {
  ion_id: number
  fdr: number | null
  adduct: string
  moldb_id: number
  moldb_name?: string | null
  detection_rate: number
}
