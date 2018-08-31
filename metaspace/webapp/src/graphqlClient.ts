import { ApolloClient,  InMemoryCache } from 'apollo-client-preset';
import { BatchHttpLink } from 'apollo-link-batch-http';
import { WebSocketLink } from 'apollo-link-ws';
import { setContext } from 'apollo-link-context';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { getOperationAST } from 'graphql/utilities/getOperationAST';

import * as config from './clientConfig.json';
import tokenAutorefresh from './tokenAutorefresh';
import reportError from './lib/reportError';

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`;
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`;

const authLink = setContext(async () => {
  try {
    return ({
      headers: {
        authorization: `Bearer ${await tokenAutorefresh.getJwt()}`,
      },
    })
  } catch (err) {
    reportError(err);
    throw err;
  }
});

const httpLink = new BatchHttpLink({
  uri: graphqlUrl,
  batchInterval: 10,
});

const wsLink = new WebSocketLink(new SubscriptionClient(wsGraphqlUrl, {
  reconnect: true,
}));

const link = authLink.split(
  (operation) => {
    // Only send subscriptions over websockets
    const operationAST = getOperationAST(operation.query, operation.operationName);
    return operationAST != null && operationAST.operation === 'subscription';
  },
  wsLink,
  httpLink,
);

const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache({
    cacheRedirects: {
      Query: {
        // Allow get-by-id queries to use cached data that originated from other kinds of queries
        dataset: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Dataset', id: args.id }),
        annotation: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Annotation', id: args.id }),
        user: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'User', id: args.userId }),
        group: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Group', id: args.groupId }),
        project: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Project', id: args.projectId }),
      }
    }
  }),
});

export const refreshLoginStatus = async () => {
  // Problem: `refreshJwt` updates the Vuex store, which sometimes immediately triggers new queries.
  // `apolloClient.resetStore()` has an error if there are any in-flight queries, so it's not suitable to run it
  // immediately after `refreshJwt`.
  // Solution: Split the `resetStore` into two parts: invalidate old data before `refreshJwt` updates Vuex,
  // then ensure that all queries are refetched.

  await apolloClient.queryManager.clearStore();
  await tokenAutorefresh.refreshJwt(true);
  try {
    await apolloClient.reFetchObservableQueries();
  } catch (err) {
    // reFetchObservableQueries throws an error if any queries fail.
    // Let the source of the query handle it instead of breaking `refreshLoginStatus`.
    console.error(err);
  }
};

export default apolloClient;
