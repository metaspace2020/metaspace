import { ApolloClient, InMemoryCache, NormalizedCacheObject } from '@apollo/client/core';
import { SchemaLink } from '@apollo/client/link/schema';
import {  makeExecutableSchema } from '@graphql-tools/schema'; // Updated imports
import { IMocks, addMocksToSchema } from '@graphql-tools/mock'; // Updated import for IMocks
import buildClientSchema from "../../tests/utils/buildClientSchema";

const lazyHash = (str: string) => Array.from(str).reduce((hash, char) => hash ^ char.charCodeAt(0), 0)

const getPath = (info: any) => {
  const path : any = []
  let cur: any = info?.path
  while (cur != null) {
    path.push(cur.key)
    cur = cur.prev
  }
  return path.reverse().join('.')
}

const getID = (info: any) => {
  const path = getPath(info)
  if (!/[0-9]/.test(path)) {
    // If there's no ID in the path, it's probably a get-by-id query so look through the query variables to find the id
    const IDs = Object.keys(info?.variableValues || {})
      .filter(key => /^id$|Id$/.test(key) && typeof info?.variableValues[key] === 'string')
      .map(key => info?.variableValues[key])
    if (IDs.length > 0) {
      return IDs.join(',')
    }
  }
  return path
}


const baseMocks: IMocks = {
  // Replace primitive types with non-randomized versions
  ID: (source, args, context, info) => getID(info),
  String: (source, args, context, info) => getPath(info),
  Boolean: (source, args, context, info) => (lazyHash(getPath(info)) & 1) === 1,
  Int: (source, args, context, info) => lazyHash(getPath(info)),
  Float: (source, args, context, info) => lazyHash(getPath(info)) / 3,
  // Query: () => ...,
  // Mutation: () => ...
}


let graphqlMockClient: ApolloClient<NormalizedCacheObject>


const getGraphqlSchema = () => {
  // const serverUrl = config.graphqlUrl || 'http://localhost:8888/graphql';
  // const link = new HttpLink({ uri: serverUrl, fetch: fetch as any });
  // const schema = await introspectSchema(link);

  let schemaJson
  try {
    schemaJson = require('./graphql-schema.json')
  } catch (err) {
    console.error('tests/utils/graphql-schema.json not found. Please run `yarn run generate-local-graphql-schema`.')
    throw err
  }

  // Normalize the schema because apollo-cli and graphql.js produce different formats, neither is what `buildClientSchema` expects
  // buildClientSchema expects `{__schema: {"queryType": ...}}`
  // apollo-cli produces `{"queryType": ...}`
  // graphql.js produces `{data:{__schema: {"queryType": ...}}}`
  if (schemaJson.data) { schemaJson = schemaJson.data }
  if (!schemaJson.__schema) { schemaJson = { __schema: schemaJson } }
  return schemaJson
}


export const initMockGraphqlClient = (mocks?: IMocks) => {
  const sdl = buildClientSchema(getGraphqlSchema());
  const schema = makeExecutableSchema({
    typeDefs: sdl,
  })
  // Apply mocks to the schema
  const mockedSchema = addMocksToSchema({
    schema,
    mocks: {
      ...baseMocks,
      ...mocks,
    },
  });

  // Remove mocked subscriptions so that they don't fire during tests.
  // It looks like graphql-tools and apollo-link-schema don't support mocking subscriptions yet
  Object.entries(schema.getSubscriptionType()!.getFields()).forEach(([, field] : any) => {
    field.resolve = () => new Promise(() => {})
  })

  graphqlMockClient = new ApolloClient({
    link: new SchemaLink({ schema: mockedSchema }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'network-only',
      },
    },
  });

  return graphqlMockClient
};

export const refreshLoginStatus = vi.fn();

export { graphqlMockClient as default };
