import gql from 'graphql-tag'
import { ApolloVueSubscribeToMoreOptions } from 'vue-apollo/types/options'

export interface SystemHealth {
  canMutate: Boolean
  canProcessDatasets: Boolean
  message?: String
}

// Always use fetchPolicy: 'cache-first' for this
export const getSystemHealthQuery = gql`query GetSystemHealth {
  systemHealth { canMutate canProcessDatasets message }
}`

// Always use fetchPolicy: 'cache-first' for this
export const getSystemHealthSubscribeToMore: ApolloVueSubscribeToMoreOptions<any> = {
  document: gql`subscription SystemHealth {
    systemHealthUpdated { canMutate canProcessDatasets message }
  }`,
  updateQuery(previousResult: any, { subscriptionData }: any) {
    return {
      systemHealth: subscriptionData.data.systemHealthUpdated,
    }
  },
}

export const updateSystemHealthMutation = gql`mutation UpdateSystemHealth ($health: UpdateSystemHealthInput!) {
  updateSystemHealth(health: $health)
}`
