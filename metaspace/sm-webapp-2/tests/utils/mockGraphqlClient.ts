import { ApolloClient, InMemoryCache, NormalizedCacheObject } from '@apollo/client/core';
import { SchemaLink } from '@apollo/client/link/schema';
import { GraphQLSchema, buildClientSchema, GraphQLResolveInfo } from 'graphql';
import { addMocksToSchema, IMocks } from '@graphql-tools/mock';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ref, provide } from 'vue';
import { makeApolloCache } from '../../src/lib/apolloCache';
import { DefaultApolloClient } from '@vue/apollo-composable';
import apolloClient from '../../src/api/graphqlClient';

const lazyHash = (str: string) => Array.from(str).reduce((hash, char) => hash ^ char.charCodeAt(0), 0);

const getPath = (info: GraphQLResolveInfo) => {
  const path = [];
  let cur: any = info.path;
  while (cur != null) {
    path.push(cur.key);
    cur = cur.prev;
  }
  return path.reverse().join('.');
};

const getID = (info: GraphQLResolveInfo) => {
  const path = getPath(info);
  if (!/[0-9]/.test(path)) {
    // If there's no ID in the path, it's probably a get-by-id query so look through the query variables to find the id
    const IDs = Object.keys(info.variableValues)
      .filter(key => /^id$|Id$/.test(key) && typeof info.variableValues[key] === 'string')
      .map(key => info.variableValues[key]);
    if (IDs.length > 0) {
      return IDs.join(',');
    }
  }
  return path;
};

const baseMocks: IMocks = {
  // Replace primitive types with non-randomized versions
  ID: (source, args, context, info) => getID(info),
  String: (source, args, context, info) => getPath(info),
  Boolean: (source, args, context, info) => (lazyHash(getPath(info)) & 1) === 1,
  Int: (source, args, context, info) => lazyHash(getPath(info)),
  Float: (source, args, context, info) => lazyHash(getPath(info)) / 3,
  // Query: () => ...,
  // Mutation: () => ...
};

let graphqlClient: ApolloClient<NormalizedCacheObject>;

const getGraphqlSchema = () => {
  // const serverUrl = config.graphqlUrl || 'http://localhost:8888/graphql';
  // const link = new HttpLink({ uri: serverUrl, fetch: fetch as any });
  // const schema = await introspectSchema(link);

  let schemaJson;
  try {
    schemaJson = require('./graphql-schema.json');
  } catch (err) {
    console.error('tests/utils/graphql-schema.json not found. Please run `yarn run generate-local-graphql-schema`.');
    throw err;
  }

  // Normalize the schema because apollo-cli and graphql.js produce different formats, neither is what `buildClientSchema` expects
  // buildClientSchema expects `{__schema: {"queryType": ...}}`
  // apollo-cli produces `{"queryType": ...}`
  // graphql.js produces `{data:{__schema: {"queryType": ...}}}`
  if (schemaJson.data) { schemaJson = schemaJson.data; }
  if (!schemaJson.__schema) { schemaJson = { __schema: schemaJson }; }
  return schemaJson;
};

export const initMockGraphqlClient = (mocks?: IMocks) => {
  const schemaJson = getGraphqlSchema();
  const executableSchema: GraphQLSchema = makeExecutableSchema({
    typeDefs: schemaJson
  });

  const schemaWithMocks = addMocksToSchema({
    schema: executableSchema,
    mocks: {
      ...baseMocks,
      ...mocks,
    },
  });

  graphqlClient = new ApolloClient({
    link: new SchemaLink({ schema: schemaWithMocks }),
    cache: makeApolloCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'network-only',
      },
    },
  });

  // Use the imported apolloClient or the local graphqlClient
  provide(DefaultApolloClient, ref(apolloClient || graphqlClient));
};

export const refreshLoginStatus = jest.fn();

export { graphqlClient as default };
