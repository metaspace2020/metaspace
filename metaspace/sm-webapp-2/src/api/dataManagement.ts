import gql from 'graphql-tag'

export interface GroupListItem {
  id: string;
  name: string;
}

export const oneGroupQuery =
  gql`query oneGroupQuery($groupId: ID!) {
  group(groupId:$groupId) {
    id
    name
  }
}`

export const oneProjectQuery =
  gql`query oneProjectQuery($projectId: ID!) {
  project(projectId:$projectId) {
    id
    name
  }
}`

export const allGroupsQuery =
gql`query allGroupsQuery($query: String) {
  allGroups(query:$query) {
    id
    name
  }
}`

export const requestAccessToGroupMutation =
gql`mutation($groupId: ID!) {
  requestAccessToGroup(groupId: $groupId){
    role
    }
  }`
