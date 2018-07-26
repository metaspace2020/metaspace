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
    email
    role
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

export const updateUserMutation =
gql`mutation ($update: updateUserInput!) {
  updateUser(update: $update) {
    id
    name
    role
    email
  }
}`

export const leaveGroupMutation =
gql`mutation leaveGroup($groupId: groupId!) {
  leaveGroup(groupId: $groupId)
}`;

export const deleteUserMutation =
gql`mutation ($id: string, $deleteDatasets: Boolean!) {
  deleteUser(id: $id, deleteDatasets: $deleteDatasets)
}`;

//
// export interface CurrentUserResult {
//   id: string;
//   name: string;
//   email: string | null;
//   groups: {
//     role: string;
//     numDatasets: number;
//     group: { id:string, name: string };
//   }[] | null;
//   primaryGroup: {
//     group: { id: string }
//   } | null;
// }


//
// async function updateUser(update: UpdateUserInput): Promise<UpdateUserResult> {
//
//   await delay(2000);
// 	const res = await apolloClient.mutate<UpdateUserResult>({
// 		mutation: gql`mutation ($update: updateUserInput!) {
//         updateUser(update: $update) {
//             id
//             name
//             role
//             email
//         }
//     }`,
//     variables: {
//       update: update
//     }
// 	});
//   return res.data!;
// 	// return {
// 	//   id: '',
// 	//   name: '',
// 	//   role: '',
// 	//   email: '',
// 	// }
// }
//
// async function leaveGroup(groupId: number): Promise<booleanType> {
//
// 	const res = await apolloClient.mutate<booleanType>({
// 		mutation: gql`mutation ($groupId: groupId!) {
//         leaveGroup(groupId: $groupId) {
//             status
//         }
//     }`,
//     variables: {
//       groupId: groupId
//     }
// 	});
//   return res.data!
// }
//
// async function deleteUser(id: string, deleteDatasets: boolean): Promise<booleanType> {
//
// 	const res = await apolloClient.mutate<booleanType>({
// 		mutation: gql`mutation ($id: string, $deleteDatasets: Boolean!) {
//         deleteUser(id: $id, deleteDatasets: $deleteDatasets) {
//             status
//         }
//     }`,
//     variables: {
//       id: id,
//       deleteDatasets: deleteDatasets
//     }
// 	});
//   return res.data!
// }

