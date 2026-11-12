import gql from 'graphql-tag'

export type ProjectEntitlement =
  | 'PRIVATE_SUBMISSION'
  | 'PRIVATE_RESUBMISSION'
  | 'EXPERIMENTS'
  | 'DIFF_ANALYSIS'
  | 'SEGMENTATION'

/** Human-readable label for each entitlement a Pro group can sponsor on a project. */
export const PROJECT_ENTITLEMENT_LABELS: Record<ProjectEntitlement, string> = {
  PRIVATE_SUBMISSION: 'Private submission',
  PRIVATE_RESUBMISSION: 'Private resubmission',
  EXPERIMENTS: 'Experiments',
  DIFF_ANALYSIS: 'Differential analysis by ROI',
  SEGMENTATION: 'Segmentation',
}

/** Display order of the entitlements. */
export const PROJECT_ENTITLEMENT_ORDER: ProjectEntitlement[] = [
  'PRIVATE_SUBMISSION',
  'PRIVATE_RESUBMISSION',
  'EXPERIMENTS',
  'DIFF_ANALYSIS',
  'SEGMENTATION',
]

export interface ProjectSponsorship {
  projectId: string
  proGroupId: string
  sponsorUserId: string
  entitlements: ProjectEntitlement[]
  createdAt: string
  proGroup: { id: string; name: string } | null
}

export const projectSponsorshipQuery = gql`
  query ProjectSponsorship($projectId: ID!) {
    projectSponsorship(projectId: $projectId) {
      projectId
      proGroupId
      sponsorUserId
      entitlements
      createdAt
      proGroup {
        id
        name
      }
    }
  }
`

export const currentUserProGroupQuery = gql`
  query CurrentUserProGroup {
    currentUserProGroup {
      id
      name
    }
  }
`

export const setProjectSponsorshipMutation = gql`
  mutation ($projectId: ID!, $entitlements: [ProjectEntitlement!]!) {
    setProjectSponsorship(projectId: $projectId, entitlements: $entitlements) {
      projectId
      entitlements
    }
  }
`

export const removeProjectSponsorshipMutation = gql`
  mutation ($projectId: ID!) {
    removeProjectSponsorship(projectId: $projectId)
  }
`
