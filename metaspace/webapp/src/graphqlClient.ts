import {ApolloClient, createBatchingNetworkInterface } from 'apollo-client';
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws';
import * as config from './clientConfig.json';
import tokenAutorefresh from './tokenAutorefresh';

const networkInterface = createBatchingNetworkInterface({
  uri: config.graphqlUrl,
  batchInterval: 10
});

networkInterface.use([{
  applyBatchMiddleware(req, next) {

    if (!req.options.headers) {
      req.options.headers = {};
    }

    const handler = (attempt: number) => {
      // wait until the browser receives a JWT
      if (!tokenAutorefresh.jwt) {
        window.setTimeout(() => handler(attempt + 1), 50 * attempt * attempt);
      } else {
        req.options.headers['Authorization'] = 'Bearer ' + tokenAutorefresh.jwt;
        next();
      }
    }

    handler(1);
  }
}]);

const wsClient = new SubscriptionClient(config.wsGraphqlUrl, {
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
