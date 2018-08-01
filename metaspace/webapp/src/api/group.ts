import gql from 'graphql-tag';

export const requestAccessToGroupMutation =
  gql`mutation requestAccessToGroup($groupId: ID!, $bringDatasets: [ID!]!) { 
    requestAccessToGroup(groupId: $groupId, bringDatasets: $bringDatasets) {
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
