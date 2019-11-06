import {EntityManager, In, ObjectType} from 'typeorm';
import {Context, ContextCacheKeyArg, ContextUser, BaseContext} from './context';
import {Project as ProjectModel, UserProjectRoleOptions as UPRO} from './modules/project/model';
import {UserError} from 'graphql-errors';
import {JwtUser} from './modules/auth/controller';
import {getUserProjectRoles} from './utils/db';
import {Request, Response} from 'express';
import * as _ from 'lodash';
import * as DataLoader from 'dataloader';

function getContext(jwtUser: JwtUser | null, entityManager: EntityManager): BaseContext;
function getContext(jwtUser: JwtUser | null, entityManager: EntityManager,
                    req: Request, res: Response): Context;
function getContext(jwtUser: JwtUser | null, entityManager: EntityManager,
                req?: Request, res?: Response) {
  const user = jwtUser != null && jwtUser.id != null ? jwtUser : null;
  const contextCache: Record<string, any> = {};

  const contextCacheGet = <TArgs extends readonly ContextCacheKeyArg[], V>
  (functionName: string, args: TArgs, func: (...args: TArgs) => V) => {
    const key = [functionName, ...args.map(v => JSON.stringify(v))].join(' ');
    if (key in contextCache) {
      return contextCache[key] as V;
    } else {
      return contextCache[key] = func(...args);
    }
  };

  const getProjectRoles = () => contextCacheGet('getProjectRoles', [], async () => {
    let projectRoles = user != null && user.id != null
      ? await getUserProjectRoles(entityManager, user.id)
      : {};
    if (req && req.session && req.session.reviewTokens) {
      const projectRepository = entityManager.getRepository(ProjectModel);
      const reviewProjects = await projectRepository.find({ where: { reviewToken: In(req.session.reviewTokens) }});
      if (reviewProjects.length > 0) {
        const reviewProjectRoles = _.fromPairs(reviewProjects.map((project) => [project.id, UPRO.REVIEWER]));
        projectRoles = {...reviewProjectRoles, ...projectRoles};
      }
    }
    return projectRoles;
  });

  const getMemberOfProjectIds = async () => {
    const projectRoles = await getProjectRoles();
    return Object.entries(projectRoles)
      .filter(([id, role]) => role != null && [UPRO.MEMBER, UPRO.MANAGER].includes(role))
      .map(([id, role]) => id);
  };

  const cachedGetEntityById = async <T>(Model: ObjectType<T> & {}, entityId: any): Promise<T | null> => {
    const modelMetadata = entityManager.connection.getMetadata(Model);
    const modelName = modelMetadata.name;
    const dataloader = contextCacheGet('cachedGetEntityByIdDataLoader', [modelName],
      (modelName) => {
        const idFields = modelMetadata.primaryColumns.map(col => col.propertyName);
        let keyFunc: (objectKey: any) => any;
        let validatingKeyFunc: (objectKey: any) => any;
        if (idFields.length === 1) {
          keyFunc = key => key;
          validatingKeyFunc = (key: any) => {
            if (typeof key !== 'string' && typeof key !== 'number') {
              throw new Error(`cachedGetEntityById: Invalid entity id: ${key}`);
            }
            return key;
          };
        } else {
          keyFunc = (objectKey) => JSON.stringify(idFields.map(idField => objectKey[idField]));
          validatingKeyFunc = (objectKey) => {
            const unrecognizedKeyField = Object.keys(objectKey).find(key => !idFields.includes(key));
            if (unrecognizedKeyField != null) {
              throw new Error(`cachedGetEntityById: Unrecognized property in entity id: ${unrecognizedKeyField}`);
            }
            return JSON.stringify(idFields.map(idField => objectKey[idField]));
          };
        }
        return new DataLoader(async (entityIds: any[]): Promise<(T|null)[]> => {
          const results = await entityManager.getRepository(Model).findByIds(entityIds);
          const keyedResults = _.keyBy(results, obj => keyFunc(modelMetadata.getEntityIdMixedMap(obj)) as string);
          return entityIds.map(id => keyedResults[keyFunc(id) as any] || null);
        }, {cacheKeyFn: validatingKeyFunc, maxBatchSize: 100});
      });
    return await dataloader.load(entityId);
  };

  const contextUser: ContextUser = {
    role: 'user',
    getProjectRoles,
    getMemberOfProjectIds,
  };
  if (user) {
    contextUser.id = user.id;
    contextUser.role = user.role as ('user' | 'admin');
    contextUser.email = user.email;
    contextUser.groupIds = user.groupIds;
  }

  return {
    req, res, entityManager,
    user: contextUser,
    isAdmin: user != null && user.role === 'admin',
    getUserIdOrFail() {
      if (user == null || user.id == null) {
        throw new UserError('Unauthenticated');
      }
      return user.id;
    },
    contextCacheGet,
    cachedGetEntityById,
  };
}
export default getContext;

export const getContextForTest = (jwtUser: JwtUser | null, entityManager: EntityManager): Context => {
  // TODO: Add mocks for req & res if/when needed
  const reqMock = { session: null };
  return getContext(jwtUser, entityManager, reqMock as any, null as any);
};
