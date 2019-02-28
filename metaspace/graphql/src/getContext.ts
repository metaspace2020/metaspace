import {EntityManager} from 'typeorm';
import {Context, ContextCacheKeyArg} from './context';
import {UserProjectRoleOptions as UPRO} from './modules/project/model';
import {UserError} from 'graphql-errors';
import {JwtUser} from './modules/auth/controller';
import {getUserProjectRoles} from './utils/db';
import {Request, Response} from 'express';


const getContext = (jwtUser: JwtUser | null, entityManager: EntityManager,
                req: Request, res: Response): Context => {
  const user = jwtUser != null && jwtUser.id != null ? jwtUser : null;
  const contextCache: Record<string, any> = {};

  const contextCacheGet = <V>(functionName: string, args: ContextCacheKeyArg[], func: (...args: ContextCacheKeyArg[]) => V) => {
    const key = [functionName, ...args.map(v => JSON.stringify(v))].join(' ');
    if (key in contextCache) {
      return contextCache[key] as V;
    } else {
      return contextCache[key] = func(...args);
    }
  };

  const getProjectRoles = () => contextCacheGet('getProjectRoles', [], async () => {
    return user != null && user.id != null
      ? await getUserProjectRoles(entityManager, user.id)
      : {};
  });

  const getMemberOfProjectIds = async () => {
    const projectRoles = await getProjectRoles();
    return Object.entries(projectRoles)
      .filter(([id, role]) => role != null && [UPRO.MEMBER, UPRO.MANAGER].includes(role))
      .map(([id, role]) => id);
  };

  return {
    req, res, entityManager,
    user: user == null || user.id == null ? null : {
      id: user.id,
      role: user.role as ('user' | 'admin'),
      email: user.email,
      groupIds: user.groupIds,
      getProjectRoles,
      getMemberOfProjectIds,
    },
    isAdmin: user != null && user.role === 'admin',
    getUserIdOrFail() {
      if (user == null || user.id == null) {
        throw new UserError('Unauthenticated');
      }
      return user.id;
    },
    // TODO: TypeScript 3.0
    // contextCacheGet<TArgs extends (string | number)[], V>(functionName: string, args: TArgs, func: (...args: TArgs) => V) {
    contextCacheGet,
  };
};
export default getContext;

export const getContextForTest = (jwtUser: JwtUser | null, entityManager: EntityManager): Context => {
  // TODO: Add mocks for req & res if/when needed
  return getContext(jwtUser, entityManager, null as any, null as any);
};
