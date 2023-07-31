import { countGroupsQuery, UserGroupRole } from './group'
import gql from 'graphql-tag'
import { ProjectRole } from './project'

export type UserRole = 'admin' | 'user' | 'anonymous';

export interface UserProfileQueryGroup {
  role: UserGroupRole;
  numDatasets: number;
  group: {
    id: string;
    name: string;
    shortName: string;
    urlSlug: string | null;
    hasPendingRequest: boolean | null;
  };
}
export interface UserProfileQueryProject {
  role: ProjectRole;
  numDatasets: number;
  project: {
    id: string,
    name: string
    urlSlug: string | null;
    hasPendingRequest: boolean | null;
  };
}

export interface UserProfileQuery {
  id: string;
  name: string;
  role: string;
  email: string | null;
  apiKey: string | null;
  groups: UserProfileQueryGroup[] | null;
  primaryGroup: UserProfileQueryGroup | null;
  projects: UserProfileQueryProject[] | null;
}

const userProfileFragment =
  gql`fragment UserProfileFragment on User {
  id
  name
  role
  email
  apiKey
  primaryGroup {
    ...UserProfileQueryGroup
  }
  groups {
    ...UserProfileQueryGroup
  }
  projects {
    role
    numDatasets
    project {
      id
      name
      urlSlug
      hasPendingRequest
    }
  }
}
fragment UserProfileQueryGroup on UserGroup {
  role
  numDatasets
  group {
    id
    name
    shortName
    urlSlug
    hasPendingRequest
  }
}
`
export const userProfileQuery =
  gql`query UserProfileQuery {
  currentUser {
    ...UserProfileFragment
  }
}
${userProfileFragment}
`

export const updateUserMutation =
  gql`mutation ($userId: ID!, $update: UpdateUserInput!) {
  updateUser(userId: $userId, update: $update) {
    ...UserProfileFragment
  }
}
${userProfileFragment}`

export const resetUserApiKeyMutation =
  gql`mutation ($userId: ID!, $removeKey: Boolean!) {
  resetUserApiKey(userId: $userId, removeKey: $removeKey) {
    ...UserProfileFragment
  }
}
${userProfileFragment}`

export interface DatasetSubmitterFragment {
  id: string;
  name: string;
  email: string;
  groups: {
    group: {
      id: string;
      name: string;
    }
  }[] | null;
  projects: {
    project: {
      id: string;
      name: string;
    }
  }[] | null;
}

export const datasetSubmitterFragment =
  gql`fragment DatasetSubmitterFragment on User {
    id
    name
    email
    groups {
      group {
        id
        name
      }
    }
    projects {
      project {
        id
        name
      }
    }
  }`

export const deleteUserMutation =
  gql`mutation ($userId: ID!, $deleteDatasets: Boolean!) {
  deleteUser(userId: $userId, deleteDatasets: $deleteDatasets)
}`

export interface CurrentUserIdResult {
  id: string;
}

// Always use fetchPolicy: 'cache-first' for this
export const currentUserIdQuery =
  gql`query CurrentUserIdQuery {
  currentUser { id }
}
`

export interface CurrentUserRoleResult {
  id: string;
  name: string;
  role: UserRole;
}

export interface CurrentUserRoleWithGroupResult {
  id: string;
  name: string;
  role: UserRole;
  groups: any;
}

// Always use fetchPolicy: 'cache-first' for this
export const currentUserRoleQuery =
  gql`query CurrentUserRoleQuery {
  currentUser { id name role }
}
`
// Always use fetchPolicy: 'cache-first' for this
export const currentUserRoleWithGroupQuery =
  gql`query MyGroupOptions {
          currentUser {
            id,
            name,
            role
            groups {
              group {
                id
                value: id
                label: name
              }
            }
          }
        }`

export const currentUserWithGroupDetectabilityQuery =
  gql`query MyGroupOptions {
          currentUser {
            id,
            name,
            groups {
              group {
                id
                value: id
                label: name
                sources {
                  source
                }
              }
            }
          }
        }`

export const countUsersQuery =
gql`query countUsers {
  countUsers
}`
