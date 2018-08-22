import gql from 'graphql-tag';

export interface CurrentUserResult {
  id: string;
  name: string;
  email: string | null;
  groups: {
    role: string;
    group: {
      id: string,
      name: string
    };
  }[]
  primaryGroup: {
    group: {
      id: string,
      name: string
    }
  } | null;
}

export const currentUserQuery =
gql`query {
  currentUser {
    id
    name
    role
    email
    groups {
      role
      group {
        id
        name
      }
    }
    primaryGroup {
      group {
        id
        name
      }
    }
  }
}
`;

export interface GroupListItem {
  id: string;
  name: string;
}

export const oneGroupQuery =
  gql`query($groupId: ID!) {
  group(groupId:$groupId) {
    id
    name
  }
}`;

export const allGroupsQuery =
gql`query($query: String) {
  allGroups(query:$query) {
    id
    name
  }
}`;

export const requestAccessToGroupMutation =
gql`mutation($groupId: ID!) {
  requestAccessToGroup(groupId: $groupId){
    role
    }
  }`;

