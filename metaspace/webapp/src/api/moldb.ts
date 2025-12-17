import gql from 'graphql-tag'

export interface MolecularDB {
  id: number
  name: string
  version: string
  isPublic: boolean
  isVisible: boolean
  downloadLink?: string
  fullName?: string
  description?: string
  link?: string
  citation?: string
  group: {
    id: number
    shortName: string
  }
  user?: {
    id: string
    name: string | null
    email: string | null
  }
  createdDT: string
  archived: boolean
  default?: boolean
  hidden?: boolean
}

export const createDatabaseQuery = gql`
  mutation ($input: CreateMolecularDBInput!) {
    createMolecularDB(databaseDetails: $input) {
      id
    }
  }
`

export const databaseDetailsQuery = gql`
  query getDatabaseDetails($id: Int!) {
    database: molecularDB(databaseId: $id) {
      archived
      citation
      description
      fullName
      link
      name
      isPublic
      isVisible
      version
      group {
        id
      }
      user {
        id
        name
        email
      }
      downloadLink
    }
  }
`

export interface DatabaseDetailsQuery {
  database: MolecularDB
}

export const updateDatabaseDetailsMutation = gql`
  mutation updateDatabaseDetails($id: Int!, $details: UpdateMolecularDBInput!) {
    updateMolecularDB(databaseId: $id, databaseDetails: $details) {
      id
      archived
    }
  }
`

export interface MolecularDBDetails {
  isPublic: boolean
  isVisible: boolean
  fullName?: string
  description?: string
  link?: string
  citation?: string
}

export interface UpdateDatabaseDetailsMutation {
  id: number
  details: MolecularDBDetails
}

export const deleteDatabaseMutation = gql`
  mutation deleteDatabaseMutation($id: Int!) {
    deleteMolecularDB(databaseId: $id)
  }
`

export interface DeleteDatabaseMutation {
  id: number
}

export const getDatabaseOptionsQuery = gql`
  query DatabaseOptions {
    allMolecularDBs {
      id
      name
      version
      archived
      group {
        id
        shortName
      }
    }
  }
`

export const publicMolecularDBsQuery = gql`
  query PublicMolecularDBs($input: PublicMolecularDBsInput!) {
    allPublicMolecularDBs(input: $input) {
      databases {
        id
        name
        version
        createdDT
        downloadLink
        group {
          id
          shortName
        }
        user {
          id
          name
          email
        }
      }
      totalCount
    }
  }
`

export interface PublicMolecularDBsInput {
  orderBy?: 'ORDER_BY_NAME' | 'ORDER_BY_VERSION' | 'ORDER_BY_CREATED_DT'
  sortingOrder?: 'ASCENDING' | 'DESCENDING'
  filter?: {
    query?: string
  }
  offset?: number
  limit?: number
}

export interface PublicMolecularDBsResult {
  databases: MolecularDB[]
  totalCount: number
}

export interface PublicMolecularDBsQuery {
  allPublicMolecularDBs: PublicMolecularDBsResult
}

export interface AllPublicMolecularDBsQuery {
  allPublicMolecularDBs: MolecularDB[]
}
