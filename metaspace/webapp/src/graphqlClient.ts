import { ApolloClient,  InMemoryCache, defaultDataIdFromObject } from 'apollo-client-preset';
import { BatchHttpLink } from 'apollo-link-batch-http';
import { WebSocketLink } from 'apollo-link-ws';
import { setContext } from 'apollo-link-context';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { getOperationAST } from 'graphql/utilities/getOperationAST';
import { onError } from 'apollo-link-error';

import * as config from './clientConfig.json';
import tokenAutorefresh from './tokenAutorefresh';
import reportError from './lib/reportError';
import {get} from 'lodash-es';

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`;
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`;

let $alert: ((message: string, title: string, options?: any) => void) | null = null;

export function setMaintenanceMessageHandler(_$alert: (message: string, title: string, options?: any) => void) {
  $alert = _$alert;
}

const isReadOnlyError = (error: any) => {
  try {
    return JSON.parse(error.message).type === 'read_only_mode';
  } catch {
    return false;
  }
};

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

const errorLink = onError(({ graphQLErrors, networkError, forward, operation }) => {
  if (graphQLErrors) {
    const readOnlyErrors = graphQLErrors.filter(isReadOnlyError);

    if (readOnlyErrors.length > 0) {
      if ($alert != null) {
        readOnlyErrors.forEach(err => { (err as any).isHandled = true; });
        $alert('This operation could not be completed. METASPACE is currently in read-only mode for scheduled maintenance. Please try again later.',
          'Scheduled Maintenance',
          {type: 'error'});
      }
    }
  } else if (networkError) {
    const message = get(networkError, 'result.message');
    if (message === 'jwt expired') {
      // noinspection JSIgnoredPromiseFromCall
      tokenAutorefresh.refreshJwt(true);
      return forward(operation);
    }
  }
});

const httpLink = new BatchHttpLink({
  uri: graphqlUrl,
  batchInterval: 10,
});

const wsClient = new SubscriptionClient(wsGraphqlUrl, {
  reconnect: true,
  async connectionParams() {
    // WORKAROUND: This is not the right place for this, but it's the only callback that gets called after a reconnect
    // and can run an async operation before any messages are sent.
    // All subscription operations need to have their JWTs updated before they are reconnected, so do that before
    // supplying the connection params.
    const operations = Object.values(wsClient.operations || {}).map(op => op.options);
    const queuedMessages: any[] = wsClient['unsentMessagesQueue'].map((m: any) => m.payload);
    const payloads = [...operations, ...queuedMessages];

    if (payloads.length > 0) {
      const jwt = await tokenAutorefresh.getJwt();
      payloads.forEach(payload => {
        payload.jwt = jwt;
      });
    }

    return {}
  }
});
wsClient.use([{
  async applyMiddleware(operationOptions: any, next: Function) {
    // Attach a JWT to each request
    try {
      operationOptions['jwt'] = await tokenAutorefresh.getJwt();
    } catch (err) {
      reportError(err);
      next(err);
    } finally {
      next();
    }
  }
}]);

const wsLink = new WebSocketLink(wsClient);
(window as any).wsClient = wsClient;
(window as any).wsLink = wsLink;

const link = errorLink.concat(authLink).split(
  (operation) => {
    // Only send subscriptions over websockets
    const operationAST = getOperationAST(operation.query, operation.operationName);
    return operationAST != null && operationAST.operation === 'subscription';
  },
  wsLink,
  httpLink,
);

const nonNormalizableTypes: any[] = ['User', 'DatasetUser', 'DatasetGroup', 'DatasetProject'];

const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache({
    cacheRedirects: {
      Query: {
        // Allow get-by-id queries to use cached data that originated from other kinds of queries
        dataset: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Dataset', id: args.id }),
        annotation: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Annotation', id: args.id }),
        group: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Group', id: args.groupId }),
        project: (_, args, { getCacheKey}) => getCacheKey({ __typename: 'Project', id: args.projectId }),
      }
    },
    dataIdFromObject(object) {
      // WORKAROUND: Because of Apollo's aggressive caching, often the current User will be overwritten with results
      // from other queries. The server side often strips fields based on how they're accessed (the "ScopeRole" logic),
      // which means these query paths will often return different data with the same IDs:
      // currentUser -> primaryGroup (always present)
      // dataset -> submitter -> primaryGroup (null unless admin)
      // To protect against this, don't allow Users (and possibly other types in the future) to have a dataId,
      // so that InMemoryCache cannot share data between different queries.
      if (nonNormalizableTypes.includes(object.__typename)) {
        return null;
      } else {
        return defaultDataIdFromObject(object);
      }
    }
  }),
  defaultOptions: {
    query: {
      fetchPolicy: 'network-only'
    }
  }
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
