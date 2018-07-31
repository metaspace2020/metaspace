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
  cache: new InMemoryCache(),
});

export default apolloClient;
