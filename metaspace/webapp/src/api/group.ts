import gql from 'graphql-tag';

export type UserGroupRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'PRINCIPAL_INVESTIGATOR';
export const getRoleName = (role: UserGroupRole | null | undefined) => {
  switch (role) {
    case 'INVITED': return 'Invited';
    case 'PENDING': return 'Requesting access';
    case 'MEMBER': return 'Member';
    case 'PRINCIPAL_INVESTIGATOR': return 'Principal investigator';
    case null: return '';
    case undefined: return '';
  }
};

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
  }`;

export interface UpdateGroupMutation {
  data: {
    id: string;
    name: string;
    shortName: string;
    currentUserRole: UserGroupRole | null;
  }
}
export const updateGroupMutation =
  gql`mutation updateGroup($groupId: ID!, $groupDetails: UpdateGroupInput!) {
    updateGroup(groupId: $groupId, groupDetails: $groupDetails) {
      id
      name
      shortName
      currentUserRole
    }
  }`;

export const deleteGroupMutation =
  gql`mutation deleteGroup($groupId: ID!) {
    deleteGroup(groupId: $groupId)
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
    group(groupId: $groupId) {
      id
      name
      shortName
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
  }`;

export interface EditGroupQuery {
  id: string;
  name: string;
  shortName: string;
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
