import gql from 'graphql-tag';

export interface SystemHealth {
  canMutate: Boolean
  canProcessDatasets: Boolean
  message?: String
}

export const getSystemHealthQuery = gql`query GetSystemHealth {
  systemHealth { canMutate canProcessDatasets message }
}`;

export const getSystemHealthSubscribeToMore = {
  document: gql`subscription SystemHealth {
    systemHealthUpdated { canMutate canProcessDatasets message }
  }`,
  updateQuery(previousResult: any, {subscriptionData}: any) {
    return {
      systemHealth: subscriptionData.data.systemHealthUpdated
    }
  }
};

export const updateSystemHealthMutation = gql`mutation UpdateSystemHealth ($health: UpdateSystemHealthInput!) {
  updateSystemHealth(health: $health)
}`;
