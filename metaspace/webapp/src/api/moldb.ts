import gql from 'graphql-tag'

export interface MolecularDB {
  archived?: boolean
  citation?: string
  default?: boolean
  description?: string
  fullName?: string
  hidden?: boolean
  id?: number
  link?: string
  name?: string
  public?: boolean
  version?: string
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
      public
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
      public
      version
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
