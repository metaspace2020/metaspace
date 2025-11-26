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
  displayOrder: number
  isVisible: boolean
  likes: number
  hasVoted: boolean
  isPro: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export enum FeatureRequestStatus {
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface CreateFeatureRequestInput {
  title: string
  description: string
}

export interface ApproveFeatureRequestInput {
  adminNotes?: string
}

export interface RejectFeatureRequestInput {
  adminNotes: string
}

export interface UpdateVisibilityInput {
  isVisible: boolean
}

export interface UpdateDisplayOrderInput {
  displayOrder: number
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
      displayOrder
      isVisible
      likes
      isPro
      createdAt
      updatedAt
      deletedAt
    }
  }
`

export const publicFeatureRequestsQuery = gql`
  query PublicFeatureRequests {
    publicFeatureRequests {
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
      displayOrder
      isVisible
      likes
      isPro
      createdAt
      updatedAt
      hasVoted
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
      displayOrder
      isVisible
      likes
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
      displayOrder
      isVisible
      likes
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
      displayOrder
      isVisible
      likes
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
      displayOrder
      isVisible
      likes
      updatedAt
    }
  }
`

export const toggleVoteFeatureRequestMutation = gql`
  mutation ToggleVoteFeatureRequest($id: ID!) {
    toggleVoteFeatureRequest(id: $id) {
      id
      likes
    }
  }
`

export const updateFeatureRequestVisibilityMutation = gql`
  mutation UpdateFeatureRequestVisibility($id: ID!, $input: UpdateVisibilityInput!) {
    updateFeatureRequestVisibility(id: $id, input: $input) {
      id
      isVisible
      updatedAt
    }
  }
`

export const updateFeatureRequestDisplayOrderMutation = gql`
  mutation UpdateFeatureRequestDisplayOrder($id: ID!, $input: UpdateDisplayOrderInput!) {
    updateFeatureRequestDisplayOrder(id: $id, input: $input) {
      id
      displayOrder
      updatedAt
    }
  }
`

export const deleteFeatureRequestMutation = gql`
  mutation DeleteFeatureRequest($id: ID!) {
    deleteFeatureRequest(id: $id)
  }
`
