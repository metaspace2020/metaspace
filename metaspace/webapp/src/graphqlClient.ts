import { ApolloLink, ApolloClient,  InMemoryCache, FetchResult } from 'apollo-client-preset';
import { BatchHttpLink } from 'apollo-link-batch-http';
import { WebSocketLink } from 'apollo-link-ws';
import {SubscriptionClient } from 'subscriptions-transport-ws';
import { OperationDefinitionNode } from 'graphql';
import Observable from 'zen-observable-ts';

import * as config from './clientConfig.json';
import tokenAutorefresh from './tokenAutorefresh';
import reportError from './lib/reportError';

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`;
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`;

const authLink = new ApolloLink((operation, forward) => {
  return new Observable<FetchResult>(observer => {
    tokenAutorefresh.getJwt()
      .then(
        jwt => {
          operation.setContext(({headers}: Record<string, any>) => ({
            headers: {
              ...headers,
              authorization: `Bearer ${jwt}`,
            },
          }));

          if (forward != null) {
            forward(operation).subscribe(observer);
          }
        },
        err => {
          reportError(err, 'There was an error connecting to the server. Please refresh the page and try again');
          observer.error(err);
        });
  });
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
    const operationDefinitionNode = operation.query.definitions.find(def => def.kind === 'OperationDefinition') as OperationDefinitionNode | undefined;
    const operationType = operationDefinitionNode && operationDefinitionNode.operation;
    return operationType === 'subscription';
  },
  wsLink,
  httpLink,
);

const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});

export default apolloClient;
