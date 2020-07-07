import gql from 'graphql-tag'

export interface MolecularDB {
  archived?: boolean
  citation?: string
  createdDT?: string
  default?: boolean
  description?: string
  fullName?: string
  hidden?: boolean
  id?: number
  link?: string
  name?: string
  isPublic?: boolean
  version?: string
  group?: {
    id?: number
  }
}

export const createDatabaseQuery =
  gql`mutation ($input: CreateMolecularDBInput!) {
      createMolecularDB(databaseDetails: $input) {
        id
      }
  }`

export const databaseListItemsQuery =
  gql`query GetDatabases {
    molecularDatabases {
      id
      name
      version
      isPublic
      archived
    }
  }`

export const databaseDetailsQuery =
  gql`query getDatabaseDetails ($id: Int!) {
    database: getMolecularDB(databaseId: $id) {
      archived
      citation
      description
      fullName
      link
      name
      isPublic
      version
      group {
        id
      }
    }
  }`

export interface DatabaseDetailsQuery {
  database: MolecularDB
}

export const updateDatabaseDetailsMutation =
  gql`mutation updateDatabaseDetails ($id: Int!, $details: UpdateMolecularDBInput!) {
    updateMolecularDB(databaseId: $id, databaseDetails: $details) {
      id
      archived
    }
  }`

export interface UpdateDatabaseDetailsMutation {
  id: number,
  details: MolecularDB,
}

export const deleteDatabaseMutation =
  gql`mutation deleteDatabaseMutation ($id: Int!) {
    deleteMolecularDB(databaseId: $id)
  }`
