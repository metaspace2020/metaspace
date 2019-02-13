import {Request, Response} from 'express';
import {EntityManager} from 'typeorm';
import {UserProjectRole} from './binding';

export type UserProjectRoles = {[projectId: string]: UserProjectRole | undefined}

export type ContextCacheKeyArg = string | number | boolean | null | undefined;

export interface ContextUser {
  role: 'user' | 'admin';
  id: string,
  email?: string,
  groupIds?: string[], // used in esConnector for ES visibility filters
  getProjectRoles: () => Promise<UserProjectRoles>;
  getMemberOfProjectIds: () => Promise<string[]>;
}

export interface Context {
  req: Request;
  res: Response;
  entityManager: EntityManager;
  user: ContextUser | null;
  isAdmin: boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  /**
   * For deduplicating slow functions, DB queries, etc. between resolvers. `contextCacheGet` memoizes `func()`
   * based on `functionName` and `args` for the duration of the context.
   * @param functionName    The name of the function being memoized, or any other namespace/unique identifier
   *                        to help prevent cache key conflicts
   * @param args            Non-nested JSON.stringify'able args to be used as cache key
   * @param func            Function to memoize
   */
  contextCacheGet: <V>(functionName: string, args: ContextCacheKeyArg[], func: (...args: ContextCacheKeyArg[]) => V) => V;
}

