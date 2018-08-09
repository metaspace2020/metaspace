import gql from 'graphql-tag';

export type UserGroupRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'PRINCIPAL_INVESTIGATOR';



export const createGroupMutation =
  gql`mutation createGroup($groupDetails: CreateGroupInput!) {
    createGroup(groupDetails: $groupDetails) {
      id
      name
      shortName
    }
  }`;


export const updateGroupMutation =
  gql`mutation updateGroup($id: ID!, $groupDetails: UpdateGroupInput!) {
    updateGroup(id: $id, groupDetails: $groupDetails) {
      id
      name
      shortName
    }
  }`;

export const deleteGroupMutation =
  gql`mutation deleteGroup($id: ID!) {
    deleteGroup(id: $id)
  }`;

export const removeUserFromGroupMutation =
  gql`mutation removeUserFromGroup($groupId: ID!, $userId: ID!) {
    removeUserFromGroup(groupId: $groupId, userId: $userId)
  }`;

export const requestAccessToGroupMutation =
  gql`mutation requestAccessToGroup($groupId: ID!, $bringDatasets: [ID!]!) { 
    requestAccessToGroup(groupId: $groupId, bringDatasets: $bringDatasets) {
      role # GraphQL demands a return value be specified
    }
  }`;

export const acceptRequestToJoinGroupMutation =
  gql`mutation acceptRequestToJoinGroup($groupId: ID!, $userId: ID!) {
    acceptRequestToJoinGroup(groupId: $groupId, userId: $userId) {
      role
    }
  }`;

export const inviteUserToGroupMutation =
  gql`mutation inviteUserToGroup($groupId: ID!, $email: String!) {
    inviteUserToGroup(groupId: $groupId, email: $email) {
      role
    }
  }`;

export const acceptGroupInvitationMutation =
  gql`mutation acceptGroupInvitation($groupId: ID!, $bringDatasets: [ID!]!) { 
    acceptGroupInvitation(groupId: $groupId, bringDatasets: $bringDatasets) {
      role
    }
  }`;

export const leaveGroupMutation =
  gql`mutation leaveGroup($groupId: ID!) { 
    leaveGroup(groupId: $groupId)
  }`;


export const editGroupQuery =
  gql`query EditGroupProfileQuery($groupId: ID!) {
    group(id: $groupId) {
      id
      name
      shortName
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
  }`;

export interface EditGroupQuery {
  id: string;
  name: string;
  shortName: string;
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
