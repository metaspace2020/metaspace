import * as config from '../../src/clientConfig.json';
import { ApolloClient, InMemoryCache, ApolloLink, HttpLink, Operation, FetchResult, NormalizedCacheObject } from 'apollo-client-preset';
import { SchemaLink } from 'apollo-link-schema';
import { addMockFunctionsToSchema, IMocks, introspectSchema } from 'graphql-tools';
import fetch from 'node-fetch';
import Observable from 'zen-observable-ts';
import Vue from 'vue';
import VueApollo from 'vue-apollo';
import { GraphQLResolveInfo } from 'graphql';

const serverUrl = config.graphqlUrl || 'http://localhost:8888/graphql';

const lazyHash = (str: string) => Array.from(str).reduce((hash, char) => hash ^ char.charCodeAt(0), 0);

const getPath = (info: GraphQLResolveInfo) => {
  let path = [];
  let cur = info.path;
  while (cur != null) {
    path.push(cur.key);
    cur = cur.prev;
  }
  return path.join('.');
};

const mocks: IMocks = {
  // Replace primitive types with non-randomized versions
  ID: (source, args, context, info) => getPath(info),
  String: (source, args, context, info) => getPath(info),
  Boolean: (source, args, context, info) => (lazyHash(getPath(info)) & 1) === 1,
  Int: (source, args, context, info) => lazyHash(getPath(info)),
  Float: (source, args, context, info) => lazyHash(getPath(info)) / 3,
  // Query: () => ...,
  // Mutation: () => ...
};

class RemoteSchemaLink extends ApolloLink {
  linkPromise = new Promise<ApolloLink>(async (resolve, reject) => {
    try {
    } catch (err) {
      reject(err);
    }
  });

  request(operation: Operation) {
    return new Observable<FetchResult>(observer => {
      this.linkPromise.then(
        link => link.request(operation)!.subscribe(observer),
        err => observer.error(err),
      );
    });
  }

}

let graphqlClient: ApolloClient<NormalizedCacheObject>;
export let apolloProvider: VueApollo;
export let provide: any;

export const initMockGraphqlClient = async () => {
  const link = new HttpLink({ uri: serverUrl, fetch: fetch as any });
  const schema = await introspectSchema(link);

  addMockFunctionsToSchema({
    schema,
    mocks,
  });

  graphqlClient = new ApolloClient({
    cache: new InMemoryCache(),
    link: new SchemaLink({ schema }),
  });

  Vue.use(VueApollo);

  apolloProvider = new VueApollo({
    defaultClient: graphqlClient,
  });
  provide = apolloProvider.provide();
};

export const refreshLoginStatus = jest.fn();

export {graphqlClient as default};
