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

//  allGroups(query: String): [Group!]!
// type Group {
//   id: ID!
//   name: String!
//   shortName: String!
//   members: [UserGroup!]    # null if current user is not allowed to see
// }

export const allGroups =
gql`query($query: String) {
  id
  name  
}`;
