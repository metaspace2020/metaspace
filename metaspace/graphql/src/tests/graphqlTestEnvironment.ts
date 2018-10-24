import {
  GraphQLField, GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLType,
  isEnumType,
  isNonNullType,
  isScalarType,
} from 'graphql';
import {runQuery} from 'apollo-server-core';
import {QueryOptions} from 'apollo-server-core/dist/runQuery';
import {Request} from 'express';

import {createConnection} from '../utils/db';
import {Connection, EntityManager} from 'typeorm';
import {Credentials} from '../modules/auth/model';
import {User} from '../modules/user/model';
import {initOperation} from '../modules/auth/operation';
import getContext from '../getContext';
import {makeNewExecutableSchema} from '../../executableSchema';
import {Context} from '../context';


const schema = makeNewExecutableSchema();
let outsideOfTransactionConn: Connection;

type TransactionEntityManager = EntityManager & { rollbackTransaction: () => Promise<void>; };
const createTransactionEntityManager = async () => {
  let txn: Promise<any>;
  let rejectTxn: () => void;
  const manager = await new Promise<TransactionEntityManager>((resolveManager) => {
    txn = outsideOfTransactionConn.transaction(txnManager => {
      resolveManager(txnManager as TransactionEntityManager);
      // Return a pending promise to allow the transaction be held open until `afterEach` rejects it
      return new Promise((resolve, reject) => {
        rejectTxn = reject;
      });
    });
  });
  manager.rollbackTransaction = async () => {
    rejectTxn();
    try { await txn; } catch {}
  };
  return manager;
};

export interface TestEnvironmentOptions {
  suppressTestDataCreation?: Boolean;
}

export let testEntityManager: EntityManager;
export let testUser: User;
export let userContext: Context;
export let anonContext: Context;
export let adminContext: Context;

export const onBeforeAll = async () => {
  outsideOfTransactionConn = await createConnection();
};

export const onAfterAll = async () => {
  await outsideOfTransactionConn.close();
};

export const onBeforeEachWithOptions = ({suppressTestDataCreation}: TestEnvironmentOptions) => async () => {
  testEntityManager = await createTransactionEntityManager();

  if (!suppressTestDataCreation) {
    const creds = testEntityManager.create(Credentials, {});
    await testEntityManager.insert(Credentials, creds);
    testUser = testEntityManager.create(User, { name: 'tester', role: 'user', credentialsId: creds.id });
    await testEntityManager.insert(User, testUser);
    userContext = getContext({ user: { user: testUser } } as any as Request, testEntityManager);
    adminContext = getContext({ user: { user: { ...testUser, role: 'admin' } } } as any as Request, testEntityManager);
  }
  anonContext = getContext({ user: { user: { role: 'anonymous' } } } as any as Request, testEntityManager);

  await initOperation(testEntityManager);
};

export const onBeforeEach = onBeforeEachWithOptions({});

export const onAfterEach = async () => {
  await (testEntityManager as TransactionEntityManager).rollbackTransaction();
  // Prevent use-after-free
  (testEntityManager as any) = undefined;
  (testUser as any) = undefined;
  (userContext as any) = undefined;
  (anonContext as any) = undefined;
  (adminContext as any) = undefined;
};

export const doQuery = async <T = any>(query: string, variables?: object, options?: Partial<QueryOptions>): Promise<T> => {
  const {data, errors} = await runQuery({
    schema,
    context: userContext || anonContext,
    queryString: query,
    variables,
    request: {} as any,
    ...options,
  });
  if (errors != null && errors.length > 0) {
    throw errors[0];
  }
  return Object.values(data || {})[0] as T;
};

// Returns a space-separated list of scalar fields so that it's easy to select all non-nested return values from a GraphQL operation
export const shallowFieldsOfSchemaType = (typeName: string) => {
  const type = schema.getType(typeName) as GraphQLObjectType | GraphQLInputObjectType;
  const isAnyScalarType = (type: GraphQLType): Boolean =>
    isScalarType(type) || isEnumType(type) || (isNonNullType(type) && isAnyScalarType(type.ofType));

  return (Object.values(type.getFields()) as (GraphQLField<any,any> | GraphQLInputField)[])
    .filter(field => isAnyScalarType(field.type))
    .map(field => field.name)
    .join(' ');
};
