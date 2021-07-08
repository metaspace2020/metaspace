import { Request, Response } from 'express'
import { EntityManager, ObjectType } from 'typeorm'
import { UserProjectRole } from './binding'

export type UserProjectRoles = {[projectId: string]: UserProjectRole}

export type ContextCacheKeyArg = string | number | boolean | null | undefined | string[];

export type ContextUserRole = 'guest' | 'user' | 'admin';

export type AuthMethod = 'JWT' | 'API_KEY' | 'SESSION' | 'UNKNOWN';
export const AuthMethodOptions: {[K in AuthMethod]: K} = {
  JWT: 'JWT',
  API_KEY: 'API_KEY',
  SESSION: 'SESSION',
  UNKNOWN: 'UNKNOWN',
}

export interface ContextUser {
  role: ContextUserRole;
  authMethod: AuthMethod;
  id?: string; // id is undefined when not logged in
  email?: string;
  getProjectRoles: () => Promise<UserProjectRoles>;
  getMemberOfGroupIds: () => Promise<string[]>; // only groups where user has UGRO.MEMBER, UGRO.GROUP_ADMIN role
  getMemberOfProjectIds: () => Promise<string[]>; // only projects where user has UPRO.MEMBER, UPRO.MANAGER role
  getVisibleDatabaseIds: () => Promise<number[]>; // only databases user has access to
}

export interface BaseContext {
  entityManager: EntityManager;
  user: ContextUser;
  isAdmin: boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  /**
   * For deduplicating slow functions, DB queries, etc. between resolvers. `contextCacheGet` memoizes `func()`
   * based on `functionName` and `args` for the duration of the context.
   * @param functionName    The name of the function being memoized, or any other namespace/unique identifier
   *                        to help prevent cache key conflicts
   * @param args            Non-nested JSON.stringify'able args to be used as cache key
   *                        NOTE: TypeScript will enforce that these arguments' types match the arguments to `func`
   * @param func            Function to memoize
   */
  contextCacheGet: <TArgs extends readonly ContextCacheKeyArg[], V>
                   (functionName: string, args: TArgs, func: (...args: TArgs) => V) => V;
  /**
   * Fast equivalent of `entityManager.getRepository(Model).findOne(id)` using DataLoader to cache & batch results.
   * @param Model           Any TypeORM Entity
   * @param id              The primary key field value to look up. For an entity with a composite primary key,
   *                        this should be an object. For entities with single-field primary keys, this should be a
   *                        string or number.
   */
  cachedGetEntityById: <T>(Model: ObjectType<T>, id: string | number | Partial<T>) => Promise<T | null>
}

export interface Context extends BaseContext {
  req: Request;
  res: Response;
}
