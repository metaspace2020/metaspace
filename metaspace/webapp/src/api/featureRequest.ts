import gql from 'graphql-tag'

export interface FeatureRequest {
  id: string
  title: string
  description: string
  status: FeatureRequestStatus
  userId: string
  adminNotes?: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export enum FeatureRequestStatus {
  PROPOSED = 'proposed',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  IN_BACKLOG = 'in_backlog',
  IN_DEVELOPMENT = 'in_development',
  IMPLEMENTED = 'implemented',
  REJECTED = 'rejected',
}

export interface FeatureRequestsByStatus {
  approved: FeatureRequest[]
  in_backlog: FeatureRequest[]
  in_development: FeatureRequest[]
  implemented: FeatureRequest[]
}

export interface CreateFeatureRequestInput {
  title: string
  description: string
}

export interface UpdateFeatureRequestStatusInput {
  status: FeatureRequestStatus
  adminNotes?: string
}

export interface ApproveFeatureRequestInput {
  adminNotes?: string
}

export interface RejectFeatureRequestInput {
  adminNotes: string
}

// Queries
export const myFeatureRequestsQuery = gql`
  query MyFeatureRequests {
    myFeatureRequests {
      id
      title
      description
      status
      userId
      adminNotes
      approvedBy
      approvedAt
      rejectedBy
      rejectedAt
      createdAt
      updatedAt
      deletedAt
    }
  }
`

export const publicFeatureRequestsQuery = gql`
  query PublicFeatureRequests {
    publicFeatureRequests {
      approved {
        id
        title
        description
        status
        userId
        adminNotes
        approvedBy
        approvedAt
        rejectedBy
        rejectedAt
        createdAt
        updatedAt
      }
      in_backlog {
        id
        title
        description
        status
        userId
        adminNotes
        approvedBy
        approvedAt
        rejectedBy
        rejectedAt
        createdAt
        updatedAt
      }
      in_development {
        id
        title
        description
        status
        userId
        adminNotes
        approvedBy
        approvedAt
        rejectedBy
        rejectedAt
        createdAt
        updatedAt
      }
      implemented {
        id
        title
        description
        status
        userId
        adminNotes
        approvedBy
        approvedAt
        rejectedBy
        rejectedAt
        createdAt
        updatedAt
      }
    }
  }
`

export const featureRequestQuery = gql`
  query FeatureRequest($id: ID!) {
    featureRequest(id: $id) {
      id
      title
      description
      status
      userId
      adminNotes
      approvedBy
      approvedAt
      rejectedBy
      rejectedAt
      createdAt
      updatedAt
      deletedAt
    }
  }
`

// Mutations
export const createFeatureRequestMutation = gql`
  mutation CreateFeatureRequest($input: CreateFeatureRequestInput!) {
    createFeatureRequest(input: $input) {
      id
      title
      description
      status
      userId
      createdAt
      updatedAt
    }
  }
`

export const approveFeatureRequestMutation = gql`
  mutation ApproveFeatureRequest($id: ID!, $input: ApproveFeatureRequestInput) {
    approveFeatureRequest(id: $id, input: $input) {
      id
      title
      description
      status
      adminNotes
      approvedBy
      approvedAt
      updatedAt
    }
  }
`

export const rejectFeatureRequestMutation = gql`
  mutation RejectFeatureRequest($id: ID!, $input: RejectFeatureRequestInput!) {
    rejectFeatureRequest(id: $id, input: $input) {
      id
      title
      description
      status
      adminNotes
      rejectedBy
      rejectedAt
      updatedAt
    }
  }
`

export const updateFeatureRequestStatusMutation = gql`
  mutation UpdateFeatureRequestStatus($id: ID!, $input: UpdateFeatureRequestStatusInput!) {
    updateFeatureRequestStatus(id: $id, input: $input) {
      id
      title
      description
      status
      adminNotes
      updatedAt
    }
  }
`

export const deleteFeatureRequestMutation = gql`
  mutation DeleteFeatureRequest($id: ID!) {
    deleteFeatureRequest(id: $id)
  }
`
