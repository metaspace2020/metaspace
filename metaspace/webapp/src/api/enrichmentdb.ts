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

export const getEnrichedMolDatabasesQuery =
gql`query allEnrichedMolDatabases($id: String!) {
  allEnrichedMolDatabases(datasetId: $id) {
    id
    name
    version
    archived
    group {
      id
      shortName
    }
  }
}`
