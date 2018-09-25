import {ApolloClient, createBatchingNetworkInterface } from 'apollo-client';
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws';
import * as config from './clientConfig.json';
import tokenAutorefresh from './tokenAutorefresh';
import reportError from './lib/reportError'
import { flatMap } from 'lodash-es';

const graphqlUrl = config.graphqlUrl || `${window.location.origin}/graphql`;
const wsGraphqlUrl = config.wsGraphqlUrl || `${window.location.origin.replace(/^http/, 'ws')}/ws`;

let $alert: ((message: string, title: string) => void) | null = null;

export function setMaintenanceMessageHandler(_$alert: (message: string, title: string) => void) {
  $alert = _$alert;
}

const networkInterface = createBatchingNetworkInterface({
  uri: graphqlUrl,
  batchInterval: 10
});

networkInterface.use([{
  async applyBatchMiddleware(req, next) {

    if (!req.options.headers) {
      req.options.headers = {};
    }
    try {
      const jwt = await tokenAutorefresh.getJwt();

      (req.options.headers as Record<string, string>)['Authorization'] = 'Bearer ' + jwt;
    } catch (err) {
      reportError(err, 'There was an error connecting to the server. Please refresh the page and try again');
      // WORKAROUND: apollo-client doesn't have good error handling here. There's no way to abort the request
      // and if `next` isn't called then it will prevent future requests, so force a server error with an invalid JWT
      // as a visible error is preferable to silently doing the wrong thing.
      (req.options.headers as Record<string, string>)['Authorization'] = 'Bearer invalid';
    }
    next();
  }
}]);

const isReadOnlyError = (error: any) => {
  try {
    return JSON.parse(error.message).type === 'read_only_mode';
  } catch {
    return false;
  }
};

networkInterface.useAfter([{
  applyBatchAfterware({ responses }, next) {
    const readOnlyErrors = flatMap(responses as any[], r => r.errors && r.errors.filter(isReadOnlyError) || []);
    if (readOnlyErrors.length > 0) {
      if ($alert != null) {
        readOnlyErrors.forEach(err => { err.isHandled = true; });
        $alert('This operation could not be completed. METASPACE is currently in read-only mode for scheduled maintenance. Please try again later.',
          'Scheduled Maintenance');
      }
    }
    next();
  }
}]);

const wsClient = new SubscriptionClient(wsGraphqlUrl, {
  reconnect: true
});

const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
  networkInterface,
  wsClient
);

const apolloClient: ApolloClient = new ApolloClient({
  networkInterface: networkInterfaceWithSubscriptions
});

export default apolloClient;
