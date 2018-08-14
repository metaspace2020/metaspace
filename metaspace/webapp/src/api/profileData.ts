import gql from 'graphql-tag';
import { UserGroupRole } from './group';


export interface UserProfileQuery {
  id: string;
  name: string;
  role: string;
  email: string | null;
  groups: {
    role: UserGroupRole;
    numDatasets: number;
    group: {
      id: string,
      name: string
    };
  }[] | null;
  primaryGroup: {
    group: {
      id: string;
      name: string;
    }
  } | null;
}

export const userProfileQuery =
gql`query {
  currentUser {
    id
    name
    role
    email
    primaryGroup {
      group {
        id
        name
      }
    }
    groups {
      role
      numDatasets
      group {
        id
        name
      }
    }
  }
}
`;

export const updateUserMutation =
gql`mutation ($update: UpdateUserInput!) {
  updateUser(update: $update) {
    id
    name
    email
  }
}`;

export const leaveGroupMutation =
gql`mutation leaveGroup($groupId: ID!) {
  leaveGroup(groupId: $groupId)
}`;

export const deleteUserMutation =
gql`mutation ($id: ID!, $deleteDatasets: Boolean!) {
  deleteUser(id: $id, deleteDatasets: $deleteDatasets)
}`;


// Mocking, TODO: delete this export when Group Profile is merged as it's a duplicate from src/api/group.ts
export const acceptGroupInvitationMutation =
gql`mutation acceptGroupInvitation($groupId: ID!, $bringDatasets: [ID!]!) { 
    acceptGroupInvitation(groupId: $groupId, bringDatasets: $bringDatasets) {
      role
    }
  }`;
