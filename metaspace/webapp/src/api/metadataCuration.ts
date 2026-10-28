import gql from 'graphql-tag'

export type CurationTermStatus = 'PENDING' | 'APPROVED' | 'MAPPED' | 'REJECTED'
export type CurationApplyState = 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED'
export type CurationTermOrderBy = 'TEXT' | 'FIRST_SUBMITTED'

export interface CurationUser {
  id: string
  name: string | null
}

export interface CurationTerm {
  id: string
  slot: string
  text: string
  normalizedText: string
  status: CurationTermStatus
  canonicalLabel: string | null
  ontologyId: string | null
  aliases: string[]
  suggestedOntologyId: string | null
  suggestedLabel: string | null
  suggestedScore: number | null
  note: string | null
  datasetId: string
  datasetName: string | null
  submitter: CurationUser | null
  submittedAt: string | null
  createdAt: string
  decidedBy: CurationUser | null
  decidedAt: string | null
  applyState: CurationApplyState
  appliedCount: number
}

export interface CurationStatusCounts {
  pending: number
  approved: number
  rejected: number
}

export interface CurationTermPage {
  terms: CurationTerm[]
  total: number
  statusCounts: CurationStatusCounts
}

export interface CurationDecisionResult {
  terms: CurationTerm[]
  skipped: number
}

export const curationTermFragment = gql`
  fragment CurationTermFields on CurationTerm {
    id
    slot
    text
    normalizedText
    status
    canonicalLabel
    ontologyId
    aliases
    suggestedOntologyId
    suggestedLabel
    suggestedScore
    note
    datasetId
    datasetName
    submitter {
      id
      name
    }
    submittedAt
    createdAt
    decidedBy {
      id
      name
    }
    decidedAt
    applyState
    appliedCount
  }
`

export const curationTermsQuery = gql`
  query CurationTerms(
    $status: CurationTermStatus
    $slot: String
    $submitterId: ID
    $query: String
    $orderBy: CurationTermOrderBy
    $offset: Int
    $limit: Int
  ) {
    curationTerms(
      status: $status
      slot: $slot
      submitterId: $submitterId
      query: $query
      orderBy: $orderBy
      offset: $offset
      limit: $limit
    ) {
      terms {
        ...CurationTermFields
      }
      total
      statusCounts {
        pending
        approved
        rejected
      }
    }
  }
  ${curationTermFragment}
`

export const curationTermQuery = gql`
  query CurationTerm($id: ID!) {
    curationTerm(id: $id) {
      ...CurationTermFields
    }
  }
  ${curationTermFragment}
`

export const approveCurationTermsMutation = gql`
  mutation ApproveCurationTerms($input: ApproveCurationTermInput!) {
    approveCurationTerms(input: $input) {
      terms {
        ...CurationTermFields
      }
      skipped
    }
  }
  ${curationTermFragment}
`

export const mapCurationTermsMutation = gql`
  mutation MapCurationTerms($input: MapCurationTermInput!) {
    mapCurationTerms(input: $input) {
      terms {
        ...CurationTermFields
      }
      skipped
    }
  }
  ${curationTermFragment}
`

export const rejectCurationTermsMutation = gql`
  mutation RejectCurationTerms($input: RejectCurationTermInput!) {
    rejectCurationTerms(input: $input) {
      terms {
        ...CurationTermFields
      }
      skipped
    }
  }
  ${curationTermFragment}
`

export const retryCurationApplyMutation = gql`
  mutation RetryCurationApply($id: ID!) {
    retryCurationApply(id: $id) {
      ...CurationTermFields
    }
  }
  ${curationTermFragment}
`

/** copied from Filters/filter-components/searchableFilterQueries.ts (submitter filter) */
export const submitterSuggestionsQuery = gql`
  query CurationSubmitterOptions($query: String!) {
    options: submitterSuggestions(query: $query) {
      id
      value: id
      label: name
    }
  }
`
