import {ApolloClient, createBatchingNetworkInterface } from 'apollo-client';
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws';
import * as config from './clientConfig.json';
import { getJWT, decodePayload } from './util';

class TokenAutorefresh {
  jwt: string
  timer: number;

  private interval = 30000; // 30 seconds

  constructor() {
    this.execute();
  }

  private async execute() {
    this.jwt = await getJWT();
    const payload = decodePayload(this.jwt);
    console.log(payload);
    const delay = payload.exp ? this.interval : 0; // update the token every 30 seconds
    this.timer = window.setTimeout(() => this.execute(), delay);
  }
}

const tokenAutorefresh = new TokenAutorefresh();

const networkInterface = createBatchingNetworkInterface({
  uri: config.graphqlUrl,
  batchInterval: 10
});

networkInterface.use([{
  applyBatchMiddleware(req, next) {
    if (!req.options.headers) {
      req.options.headers = {};
    }
    req.options.headers['Authorization'] = 'Bearer ' + tokenAutorefresh.jwt;
    next();
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
