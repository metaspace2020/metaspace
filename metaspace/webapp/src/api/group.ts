import gql from 'graphql-tag'
import { MolecularDB } from './moldb'

export type UserGroupRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'GROUP_ADMIN';
export const UserGroupRoleOptions: {[R in UserGroupRole]: R} = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  GROUP_ADMIN: 'GROUP_ADMIN',
}
export const getRoleName = (role: UserGroupRole | null | undefined) => {
  switch (role) {
    case 'INVITED': return 'Invited'
    case 'PENDING': return 'Requesting access'
    case 'MEMBER': return 'Member'
    case 'GROUP_ADMIN': return 'Group admin'
    case null: return ''
    case undefined: return ''
  }
}

export interface CreateGroupMutation {
  createGroup: {
    id: string;
  };
}
export const createGroupMutation =
  gql`mutation createGroup($groupDetails: CreateGroupInput!) {
    createGroup(groupDetails: $groupDetails) {
      id
    }
  }`

export interface UpdateGroupMutation {
  data: {
    id: string;
    name: string;
    shortName: string;
    urlSlug: string | null;
    groupDescriptionAsHtml: string;
    currentUserRole: UserGroupRole | null;
  }
}
export const updateGroupMutation =
  gql`mutation updateGroup($groupId: ID!, $groupDetails: UpdateGroupInput!) {
    updateGroup(groupId: $groupId, groupDetails: $groupDetails) {
      id
      name
      shortName
      urlSlug
      currentUserRole
    }
  }`

export const deleteGroupMutation =
  gql`mutation deleteGroup($groupId: ID!) {
    deleteGroup(groupId: $groupId)
  }`

export const removeUserFromGroupMutation =
  gql`mutation removeUserFromGroup($groupId: ID!, $userId: ID!) {
    removeUserFromGroup(groupId: $groupId, userId: $userId)
  }`

export const requestAccessToGroupMutation =
  gql`mutation requestAccessToGroup($groupId: ID!) {
    requestAccessToGroup(groupId: $groupId) {
      role # GraphQL demands a return value be specified
    }
  }`

export const acceptRequestToJoinGroupMutation =
  gql`mutation acceptRequestToJoinGroup($groupId: ID!, $userId: ID!) {
    acceptRequestToJoinGroup(groupId: $groupId, userId: $userId) {
      role
    }
  }`

export const inviteUserToGroupMutation =
  gql`mutation inviteUserToGroup($groupId: ID!, $email: String!) {
    inviteUserToGroup(groupId: $groupId, email: $email) {
      role
    }
  }`

export const acceptGroupInvitationMutation =
  gql`mutation acceptGroupInvitation($groupId: ID!) {
    acceptGroupInvitation(groupId: $groupId) {
      role
    }
  }`

export const leaveGroupMutation =
  gql`mutation leaveGroup($groupId: ID!) {
    leaveGroup(groupId: $groupId)
  }`

export const updateUserGroupMutation =
  gql`mutation updateUserGroup($groupId: ID!, $userId: ID!, $update: UpdateUserGroupInput!) {
    updateUserGroup(groupId: $groupId, userId: $userId, update: $update)
  }`

export const importDatasetsIntoGroupMutation =
  gql`mutation($groupId: ID!, $datasetIds: [ID!]!) {
    importDatasetsIntoGroup(groupId: $groupId, datasetIds: $datasetIds)
  }`

export const editGroupQuery =
  gql`query EditGroupProfileQuery($groupId: ID!) {
    group(groupId: $groupId) {
      id
      name
      shortName
      urlSlug
      currentUserRole
      members {
        role
        numDatasets
        user {
          id
          name
          email
        }
      }
    }
  }`

export interface EditGroupQuery {
  id: string;
  name: string;
  shortName: string;
  urlSlug: string | null;
  currentUserRole: UserGroupRole | null;
  members: EditGroupQueryMember[] | null;
}
export interface EditGroupQueryMember {
  role: UserGroupRole,
  numDatasets: number,
  user: EditGroupQueryUser
}
export interface EditGroupQueryUser {
  id: string;
  name: string;
  email: string | null;
}

export interface ViewGroupResult {
  id: string;
  name: string;
  shortName: string;
  urlSlug: string | null;
  currentUserRole: UserGroupRole | null;
  numMembers: number;
  groupDescriptionAsHtml: string;
  members: ViewGroupMember[] | null;
  numDatabases: number;
}

interface ViewGroupMember {
  role: UserGroupRole;
  numDatasets: number;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  }
}

export const ViewGroupFragment = gql`fragment ViewGroupFragment on Group {
  id
  name
  shortName
  urlSlug
  currentUserRole
  numMembers
  members {
    role
    numDatasets
    user { id name email }
  }
  groupDescriptionAsHtml
  numDatabases
}`

export const getGroupDatabasesQuery =
  gql`query GetGroupDatabasesQuery($groupId: ID!) {
    group(groupId: $groupId) {
      id
      numDatabases # updates tab count when database is added
      molecularDatabases {
        archived
        createdDT
        id
        isPublic
        name
        version
        user { id name email}
      }
    }
  }`

export const getUserGroupsQuery =
  gql`query GetUserGroupsQuery($query: String!, $useRole: Boolean) {
    allGroups(query: $query, limit: 1000, useRole: $useRole) {
      ...ViewGroupFragment
    }
  }${ViewGroupFragment}`

export const countGroupDatasets =
  gql`query ($groupId: ID!) { countDatasets(filter: { group: $groupId }) }`

export const countGroupsQuery =
gql`query countGroups {
  countGroups
}`

export const countPublicationsQuery =
gql`query countPublications {
  countPublications
}`

export const countReviewsQuery =
gql`query countReviews {
  countReviews
}`
