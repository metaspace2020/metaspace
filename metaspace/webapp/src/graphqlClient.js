import ApolloClient, { createBatchingNetworkInterface } from 'apollo-client';

import config from './clientConfig.json';

const apolloClient = new ApolloClient({
  networkInterface: createBatchingNetworkInterface({
    uri: config.graphqlUrl,
    batchInterval: 10
  })
});

export default apolloClient;
