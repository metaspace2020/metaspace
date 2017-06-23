import ApolloClient, { createBatchingNetworkInterface } from 'apollo-client';
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws';

import config from './clientConfig.json';

const networkInterface = createBatchingNetworkInterface({
  uri: config.graphqlUrl,
  batchInterval: 10
});

const wsClient = new SubscriptionClient(config.wsGraphqlUrl, {
  reconnect: true
});

const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
  networkInterface,
  wsClient
);

const apolloClient = new ApolloClient({
  networkInterface: networkInterfaceWithSubscriptions
});

export default apolloClient;
