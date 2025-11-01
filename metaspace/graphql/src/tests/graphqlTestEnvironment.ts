import {
  graphql,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLType,
  isEnumType,
  isNonNullType,
  isScalarType,
} from 'graphql'

import { createConnection } from '../utils/db'
import { Connection, EntityManager } from 'typeorm'
import { User } from '../modules/user/model'
import { initOperation } from '../modules/auth/operation'
import { getContextForTest } from '../getContext'
import { makeNewExecutableSchema } from '../../executableSchema'
import { Context } from '../context'
import { createTestUser } from './testDataCreation'

const schema = makeNewExecutableSchema()
let outsideOfTransactionConn: Connection

type TransactionEntityManager = EntityManager & { rollbackTransaction: () => Promise<void>; };
const createTransactionEntityManager = async() => {
  let txn: Promise<any>
  let rejectTxn: () => void
  const manager = await new Promise<TransactionEntityManager>((resolve) => {
    txn = outsideOfTransactionConn.transaction(txnManager => {
      resolve(txnManager as TransactionEntityManager)
      // Return a pending promise to allow the transaction be held open until `afterEach` rejects it
      return new Promise((resolve, reject) => {
        rejectTxn = reject
      })
    })
  })
  manager.rollbackTransaction = async() => {
    rejectTxn()
    try { await txn } catch {}
  }
  // Replace transaction implementation to prevent issues with nested transactions
  manager.transaction = async(...args: any[]) => {
    if (args.length === 1) {
      return await args[0](manager)
    } else {
      return await args[1](manager)
    }
  }
  return manager
}

export interface TestEnvironmentOptions {
  suppressTestDataCreation?: boolean;
}

export let testEntityManager: EntityManager
export let testUser: User
export let adminUser: User
export let userContext: Context
export let anonContext: Context
export let adminContext: Context

export const onBeforeAll = async() => {
  outsideOfTransactionConn = await createConnection()
}

export const onAfterAll = async() => {
  await outsideOfTransactionConn.close()
}

export const onBeforeEach = async() => {
  testEntityManager = await createTransactionEntityManager();

  // Prevent use-after-free
  (testUser as any) = undefined;
  (userContext as any) = undefined;
  (adminContext as any) = undefined

  anonContext = getContextForTest({ role: 'anonymous' }, testEntityManager)

  await initOperation(testEntityManager)
}

export const setupTestUsers = async(groupIds?: string[]) => {
  testUser = await createTestUser()
  adminUser = await createTestUser({ role: 'admin' })
  userContext = getContextForTest({ ...testUser, groupIds } as any, testEntityManager)
  adminContext = getContextForTest(adminUser, testEntityManager)
}

export const onAfterEach = async() => {
  await (testEntityManager as TransactionEntityManager).rollbackTransaction();
  // Prevent use-after-free
  (testEntityManager as any) = undefined;
  (testUser as any) = undefined;
  (userContext as any) = undefined;
  (anonContext as any) = undefined;
  (adminContext as any) = undefined
}

interface DoQueryOptions {
  context?: Context
}

export const doQuery = async <T = any>(query: string, variables?: any, options?: DoQueryOptions): Promise<T> => {
  const context = options?.context || userContext || anonContext
  const { data, errors } = await graphql({
    schema,
    contextValue: context,
    source: query,
    variableValues: variables,
  });
  (context as any).contextCacheClear()
  if (errors != null && errors.length > 0) {
    throw errors[0]
  }
  return Object.values(data || {})[0] as T
}

// Returns a space-separated list of scalar fields so that it's easy to select all non-nested return values from a GraphQL operation
export const shallowFieldsOfSchemaType = (typeName: string) => {
  const type = schema.getType(typeName) as GraphQLObjectType | GraphQLInputObjectType
  const isAnyScalarType = (type: GraphQLType): boolean =>
    isScalarType(type) || isEnumType(type) || (isNonNullType(type) && isAnyScalarType(type.ofType))

  return (Object.values(type.getFields()) as (GraphQLField<any, any> | GraphQLInputField)[])
    .filter(field => isAnyScalarType(field.type))
    .map(field => field.name)
    .join(' ')
}
