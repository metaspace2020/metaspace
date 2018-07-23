import apolloClient from '../graphqlClient'
import gql from 'graphql-tag';

interface updateUserInput {
  id: number
  name: string
  role: string
  email: string
  primaryGroupId: number
}

function sendVerificationRequest(updateUserInput: updateUserInput): any {
  return new Promise((resolve, reject) => {
	  const res = apolloClient.mutate({
		  mutation: gql`mutation ($update: updateUserInput!) {
        updateUser(update: $update)
      }`,
      variables(): any {
        return {
          update: updateUserInput
        }
      }
	  });
    (res !== undefined) ? resolve(res) : reject(new Error("User update was not successful"))
  })
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
  sendVerificationRequest,
  leaveGroupRequest,
  deleteAccountRequest
}