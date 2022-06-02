import gql from 'graphql-tag'

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

export const checkIfEnrichmentRequested =
gql`query enrichmentRequested($id: String!) {
  enrichmentRequested(datasetId: $id)
}`
