import gql from 'graphql-tag'

export interface MolecularDB {
  id: number
  name: string
  version: string
  isPublic: boolean
  fullName?: string
  description?: string
  link?: string
  citation?: string
  group: {
    id: number
    shortName: string
  }
  createdDT: string
  archived: boolean
  default?: boolean
  hidden?: boolean
}

export const createDatabaseQuery =
  gql`mutation ($input: CreateMolecularDBInput!) {
      createMolecularDB(databaseDetails: $input) {
        id
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

export interface MolecularDBDetails {
  isPublic: boolean
  fullName?: string
  description?: string
  link?: string
  citation?: string
}

export interface UpdateDatabaseDetailsMutation {
  id: number,
  details: MolecularDBDetails,
}

export const deleteDatabaseMutation =
  gql`mutation deleteDatabaseMutation ($id: Int!) {
    deleteMolecularDB(databaseId: $id)
  }`

export interface DeleteDatabaseMutation {
  id: number,
}
