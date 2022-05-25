export interface EnrichmentDB {
  id: number
  name: string
}

export interface EnrichmentTerm {
  id: number
  enrichmentId: string
  enrichmentName: string
  enrichmentDB: EnrichmentDB
}
