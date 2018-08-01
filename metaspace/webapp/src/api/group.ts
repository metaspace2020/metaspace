import graphqlClient from '../graphqlClient';
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

export const requestAccessToGroup = async (groupId: string, bringDatasets: string[] = []) => {
  await graphqlClient.mutate({
    mutation: requestAccessToGroupMutation,
    variables: { groupId, bringDatasets },
  });
};

export const acceptGroupInvitation = async (groupId: string, bringDatasets: string[] = []) => {
  await graphqlClient.mutate({
    mutation: acceptGroupInvitationMutation,
    variables: { groupId, bringDatasets },
  });
};

export const leaveGroup = async (groupId: string) => {
  await graphqlClient.mutate({
    mutation: leaveGroupMutation,
    variables: { groupId },
  });
};
