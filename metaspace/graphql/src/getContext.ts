import { EntityManager, In, ObjectType } from 'typeorm'
import { Context, ContextCacheKeyArg, ContextUser, BaseContext, ContextUserRole, AuthMethodOptions } from './context'
import { User as UserModel } from './modules/user/model'
import { Project as ProjectModel, UserProjectRoleOptions as UPRO } from './modules/project/model'
import { UserError } from 'graphql-errors'
import { JwtUser } from './modules/auth/controller'
import { getUserProjectRoles } from './utils/db'
import { Request, Response } from 'express'
import * as _ from 'lodash'
import * as DataLoader from 'dataloader'
import { MolecularDbRepository } from './modules/moldb/MolecularDbRepository'
import { UserProjectRole } from './binding'
import { UserGroup, UserGroupRoleOptions as UGRO } from './modules/group/model'

const getBaseContext = (userFromRequest: JwtUser | UserModel | null, entityManager: EntityManager,
  req?: Request, res?: Response) => {
  const user = userFromRequest != null && userFromRequest.id != null ? userFromRequest : null
  let contextCache: Record<string, any> = {}

  const contextCacheGet = <TArgs extends readonly ContextCacheKeyArg[], V>
    (functionName: string, args: TArgs, func: (...args: TArgs) => V): V => {
    const key = [functionName, ...args.map(v => JSON.stringify(v))].join(' ')
    if (key in contextCache) {
      return contextCache[key] as V
    } else {
      contextCache[key] = func(...args)
      return contextCache[key]
    }
  }

  const contextCacheClear = () => {
    contextCache = {}
  }

  const getProjectRoles = () => contextCacheGet(
    'getProjectRoles',
    [],
    async(): Promise<Record<string, UserProjectRole>> => {
      let projectRoles = user != null && user.id != null
        ? await getUserProjectRoles(entityManager, user.id)
        : {}
      if (req && req.session && req.session.reviewTokens) {
        const projectRepository = entityManager.getRepository(ProjectModel)
        const reviewProjects = await projectRepository.find({ where: { reviewToken: In(req.session.reviewTokens) } })
        if (reviewProjects.length > 0) {
          const reviewProjectRoles = _.fromPairs(reviewProjects.map((project) => [project.id, UPRO.REVIEWER]))
          projectRoles = { ...reviewProjectRoles, ...projectRoles }
        }
      }
      return projectRoles
    })

  const getMemberOfProjectIds = async() => {
    const projectRoles = await getProjectRoles()
    return Object.entries(projectRoles)
      .filter(([, role]) => role != null && [UPRO.MEMBER, UPRO.MANAGER].includes(role))
      .map(([id]) => id)
  }

  const getMemberOfGroupIds = () => contextCacheGet('getMemberOfGroupIds', [], async() => {
    if (user == null) {
      return []
    }
    const userGroups = await entityManager.find(UserGroup, { userId: user.id })
    return userGroups
      .filter(ug => [UGRO.MEMBER, UGRO.GROUP_ADMIN].includes(ug.role))
      .map(ug => ug.groupId)
  })

  const getVisibleDatabaseIds = async(): Promise<number[]> => {
    const databases = await entityManager.getCustomRepository(MolecularDbRepository).findDatabases(contextUser)
    return databases.map(db => db.id)
  }

  const cachedGetEntityById = async <T>(Model: ObjectType<T>, entityId: any): Promise<T | null> => {
    const modelMetadata = entityManager.connection.getMetadata(Model)
    const modelName = modelMetadata.name
    const dataloader = contextCacheGet('cachedGetEntityByIdDataLoader', [modelName],
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */ // Unused, but needed for memoization to make sense
      (modelName) => {
        const idFields = modelMetadata.primaryColumns.map(col => col.propertyName)
        let keyFunc: (objectKey: any) => any
        let validatingKeyFunc: (objectKey: any) => any
        if (idFields.length === 1) {
          keyFunc = key => key
          validatingKeyFunc = (key: any) => {
            if (typeof key !== 'string' && typeof key !== 'number') {
              throw new Error(`cachedGetEntityById: Invalid entity id: ${key}`)
            }
            return key
          }
        } else {
          keyFunc = (objectKey) => JSON.stringify(idFields.map(idField => objectKey[idField]))
          validatingKeyFunc = (objectKey) => {
            const unrecognizedKeyField = Object.keys(objectKey).find(key => !idFields.includes(key))
            if (unrecognizedKeyField != null) {
              throw new Error(`cachedGetEntityById: Unrecognized property in entity id: ${unrecognizedKeyField}`)
            }
            return JSON.stringify(idFields.map(idField => objectKey[idField]))
          }
        }
        return new DataLoader(async(entityIds: any[]): Promise<(T|null)[]> => {
          const results = await entityManager.getRepository(Model).findByIds(entityIds)
          const keyedResults = _.keyBy(results, obj => keyFunc(modelMetadata.getEntityIdMixedMap(obj)) as string)
          return entityIds.map(id => keyedResults[keyFunc(id)] || null)
        }, { cacheKeyFn: validatingKeyFunc, maxBatchSize: 100 })
      })
    return await dataloader.load(entityId)
  }

  const contextUser: ContextUser = {
    role: 'guest',
    authMethod: req && req.authInfo || AuthMethodOptions.UNKNOWN,
    getProjectRoles,
    getMemberOfGroupIds,
    getMemberOfProjectIds,
    getVisibleDatabaseIds,
  }
  if (user) {
    contextUser.id = user.id
    contextUser.role = user.role as ContextUserRole
    contextUser.email = user.email || undefined
  }

  return {
    req,
    res,
    entityManager,
    user: contextUser,
    isAdmin: user != null && user.role === 'admin',
    getUserIdOrFail() {
      if (user == null || user.id == null) {
        throw new UserError('Unauthenticated')
      }
      return user.id
    },
    contextCacheGet,
    contextCacheClear, // Only intended for use in tests
    cachedGetEntityById,
  }
}

const getContext = (jwtUser: JwtUser | null, entityManager: EntityManager,
  req: Request, res: Response): Context => {
  return getBaseContext(jwtUser, entityManager, req, res) as Context
}

export const getContextForSubscription = (jwtUser: JwtUser | null, entityManager: EntityManager): BaseContext => {
  return getBaseContext(jwtUser, entityManager)
}

export default getContext

export const getContextForTest = (jwtUser: JwtUser | UserModel | null, entityManager: EntityManager): Context => {
  // TODO: Add mocks for req & res if/when needed
  const reqMock = { session: null, authInfo: AuthMethodOptions.JWT } as any as Request
  return getBaseContext(jwtUser, entityManager, reqMock, {} as Response) as Context
}
