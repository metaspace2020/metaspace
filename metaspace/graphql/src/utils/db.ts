import 'reflect-metadata'
import * as _ from 'lodash'
import { createConnection as createTypeORMConnection, EntityManager } from 'typeorm'
import { User as UserModel } from '../modules/user/model'
import { UserProject as UserProjectModel } from '../modules/project/model'
import typeOrmConfig from './typeOrmConfig'

export const createConnection = async() => {
  return await createTypeORMConnection({
    ...typeOrmConfig,
  })
}

export const findUserByEmail = async(entityManager: EntityManager, value: string, field = 'email') => {
  return await entityManager.getRepository(UserModel)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.credentials', 'credentials')
    .where(`LOWER(${field}) = :email`, { email: value.toLowerCase() })
    .getOne() || null
}

export const getUserProjectRoles = async(entityManager: EntityManager, userId: string) => {
  const userProjects = await entityManager.getRepository(UserProjectModel)
    .find({ where: { userId } })
  return _.fromPairs(userProjects.map(up => [up.projectId, up.role]))
}
