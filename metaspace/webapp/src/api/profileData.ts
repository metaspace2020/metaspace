import gql from 'graphql-tag';

export const currentUserQuery =
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