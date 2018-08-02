import apolloClient from '../graphqlClient'
import gql from 'graphql-tag';
import {delay} from "../util";
import {booleanType} from "aws-sdk/clients/iam";

interface User {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  groups: UserGroup[] | null;
  primaryGroup: UserGroup | null;
}

interface UserGroup {
  user: User;
  group: Group;
  role: string;
  numDatasets: number;
}

interface Group {
  id: string;
  name: string;
  shortName: string;
  members: UserGroup[];
}

interface UpdateUserInput {
  id: number;
  name: string;
  role: string;
  email: string;
  primaryGroupId: number;
}

interface UpdateUserResult {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
}

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
