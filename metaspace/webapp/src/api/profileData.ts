import apolloClient from '../graphqlClient'
import gql from 'graphql-tag';
import {delay} from "../util";

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

export const currentUserQuery = gql`
  query {
      currentUser {
          id
          name
          email
          groups {
              role
              numDatasets
              group {
                  id
                  name
              }
          }
          primaryGroup {
              group {
                  id
              }
          }
      }
  }
`;

export interface CurrentUserResult {
  id: string;
  name: string;
  email: string | null;
  groups: {
    role: string;
    numDatasets: number;
    group: { id:string, name: string };
  }[] | null;
  primaryGroup: {
    group: { id: string }
  } | null;
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

async function updateUser(update: UpdateUserInput): Promise<UpdateUserResult> {

  await delay(2000);
  // const res = await apolloClient.mutate<UpdateUserResult>({
  //   mutation: gql`mutation ($update: updateUserInput!) {
  //     updateUser(update: $update) {
  //         id
  //         name
  //         role
  //         email
  //     }
  //   }`,
  //   variables: {
  //     update: update
  //   }
  // });
  // return res.data!;
  return {
    id: '',
    name: '',
    role: '',
    email: '',
  }
}

function leaveGroupRequest(groupId: number): any {
  return new Promise((resolve, reject) => {
    const res = apolloClient.mutate({
	    mutation: gql`mutation ($groupId: ID!) {
        leaveGroup(groupId: $groupId)
      }`,
      variables(): any {
	      return {
          groupId: groupId
        }
      }
    });
    (res !== undefined) ? resolve(res) : reject(new Error("User update was not successful"))
  })
}

function deleteAccountRequest(id: number, deleteDatasets: boolean): any {
  return new Promise((resolve, reject) => {
    const res = apolloClient.mutate({
	    mutation: gql`mutation ($id: ID!, $deleteDatasets: Boolean) {
          deleteUser(id: $id, deleteDatasets: $deleteDatasets)
      }`,
      variables(): any {
	      return {
          id: id,
          deleteDatasets: deleteDatasets
        }
      }
    });
    (res !== undefined) ? resolve(res) : reject(new Error("User update was not successful"))
  })
}

export {
  updateUser,
  leaveGroupRequest,
  deleteAccountRequest
}