import { UserError } from 'graphql-errors'
import { EntityManager, In } from 'typeorm'

import { Group as GroupModel, GroupDetectability, UserGroup as UserGroupModel, UserGroupRoleOptions } from './model'
import { User as UserModel } from '../user/model'
import { Dataset as DatasetModel } from '../dataset/model'
import { MolecularDB as MolecularDbModel } from '../moldb/model'
import { Group, UserGroup, UserGroupRole } from '../../binding'
import { Context, ContextUser } from '../../context'
import { Scope, ScopeRoleOptions, UserGroupSource } from '../../bindingTypes'
import { findUserByEmail, LooselyCompatible } from '../../utils'
import { sendInvitationEmail } from '../auth'
import { sendAcceptanceEmail, sentGroupOrProjectInvitationEmail, sendRequestAccessEmail } from '../groupOrProject/email'
import config from '../../utils/config'
import logger from '../../utils/logger'
import { createInactiveUser } from '../auth/operation'
import { smApiUpdateDataset } from '../../utils/smApi/datasets'
import { getDatasetForEditing } from '../dataset/operation/getDatasetForEditing'
import { resolveGroupScopeRole } from './util/resolveGroupScopeRole'
import { urlSlugMatchesClause, validateUrlSlugChange } from '../groupOrProject/urlSlug'
import { MolecularDbRepository } from '../moldb/MolecularDbRepository'
import fetch from 'node-fetch'
import { URLSearchParams } from 'url'

const assertUserAuthenticated = (user: ContextUser) => {
  if (!user.id) {
    throw new UserError('Not authenticated')
  }
}

const assertUserRoles = async(
  entityManager: EntityManager, user: ContextUser, groupId: string, roles: UserGroupRole[]
) => {
  if (groupId) {
    if (user.id && user.role === 'admin') {
      return
    }

    const userGroup = user.id
      ? (await entityManager.getRepository(UserGroupModel).find({
          select: ['userId'],
          where: {
            userId: user.id,
            groupId,
            role: In(roles),
          },
        }))
      : null
    if (!userGroup) {
      throw new UserError('Access denied')
    }
  }
}

const assertCanEditGroup = async(entityManager: EntityManager, user: ContextUser, groupId: string) => {
  assertUserAuthenticated(user)
  await assertUserRoles(entityManager, user, groupId,
    [UserGroupRoleOptions.GROUP_ADMIN])
}

const assertCanAddDataset = async(entityManager: EntityManager, user: ContextUser, groupId: string) => {
  assertUserAuthenticated(user)
  await assertUserRoles(entityManager, user, groupId,
    [UserGroupRoleOptions.GROUP_ADMIN, UserGroupRoleOptions.MEMBER])
}

const updateUserGroupDatasets = async(
  entityManager: EntityManager, userId: string, groupId: string, groupApproved: boolean
) => {
  const datasetRepo = entityManager.getRepository(DatasetModel)
  const datasetsToUpdate = await datasetRepo.find({
    where: { userId, groupId, groupApproved: !groupApproved },
  })
  await Promise.all(datasetsToUpdate.map(async ds => {
    await datasetRepo.update({ id: ds.id }, { groupApproved })
    await smApiUpdateDataset(ds.id, { groupId }, { asyncEsUpdate: true })
  }))
}

export const Resolvers = {
  UserGroup: {
    async numDatasets(userGroup: UserGroupSource, _: any, { entityManager }: Context) {
      const { userId, groupId, user } = userGroup
      const canSeePrivateDatasets = [
        ScopeRoleOptions.GROUP_MEMBER,
        ScopeRoleOptions.GROUP_MANAGER,
      ].includes(user.scopeRole)

      return await entityManager.getRepository(DatasetModel)
        .createQueryBuilder('dataset')
        .innerJoin(
          '(SELECT id, status, is_public FROM "public"."dataset")',
          'engine_dataset',
          'dataset.id = engine_dataset.id'
        )
        .where('dataset.userId = :userId', { userId })
        .andWhere('dataset.groupId = :groupId', { groupId })
        .andWhere(canSeePrivateDatasets ? 'TRUE' : 'engine_dataset.is_public')
        .andWhere('engine_dataset.status != \'FAILED\'')
        .getCount()
    },
  },

  Group: {
    async currentUserRole(group: GroupModel, _: any, { user, entityManager }: Context) {
      if (user.id == null) {
        return null
      }
      const userGroup = await entityManager.getRepository(UserGroupModel).findOne({
        where: {
          userId: user.id,
          groupId: group.id,
        },
      })
      return userGroup ? userGroup.role : null
    },

    async hasPendingRequest(group: GroupModel & Scope, args: any, ctx: Context): Promise<boolean | null> {
      if (group.scopeRole === ScopeRoleOptions.GROUP_MANAGER) {
        const requests = await ctx.entityManager.getRepository(UserGroupModel).count({
          where: { groupId: group.id, role: UserGroupRoleOptions.PENDING },
        })
        return requests > 0
      }
      return null
    },

    async numMembers(group: GroupModel & Scope, args: any, ctx: Context): Promise<number> {
      return await ctx.entityManager
        .getRepository(UserGroupModel)
        .count({
          where: { groupId: group.id, role: In([UserGroupRoleOptions.MEMBER, UserGroupRoleOptions.GROUP_ADMIN]) },
        })
    },

    async members({ scopeRole, ...group }: GroupModel & Scope,
      _: any, ctx: Context): Promise<LooselyCompatible<UserGroup & Scope>[]|null> {
      const canSeeAllMembers = [ScopeRoleOptions.GROUP_MEMBER, ScopeRoleOptions.GROUP_MANAGER].includes(scopeRole)
        || ctx.isAdmin
      const filter = canSeeAllMembers
        ? { groupId: group.id }
        : { groupId: group.id, role: UserGroupRoleOptions.GROUP_ADMIN }

      const userGroupModels = await ctx.entityManager.getRepository(UserGroupModel)
        .createQueryBuilder('user_group')
        .where(filter)
        .leftJoinAndSelect('user_group.user', 'user')
        .leftJoinAndSelect('user_group.group', 'group')
        .orderBy(`CASE user_group.role
                      WHEN '${UserGroupRoleOptions.PENDING}' THEN 1
                      WHEN '${UserGroupRoleOptions.INVITED}' THEN 2
                      WHEN '${UserGroupRoleOptions.GROUP_ADMIN}' THEN 3
                      WHEN '${UserGroupRoleOptions.MEMBER}' THEN 4
                      ELSE 5
                  END`)
        .addOrderBy('user.name')
        .getMany()
      return userGroupModels.map(ug => ({
        ...ug,
        user: { ...ug.user, scopeRole },
      }))
    },

    async sources(group: GroupModel, _: any, ctx: Context): Promise<any> {
      const groupSourcesModels = await ctx.entityManager.getRepository(GroupDetectability)
        .createQueryBuilder('group_detectability')
        .where({ groupId: group.id })
        .getMany()
      return groupSourcesModels
    },

    async molecularDatabases(group: GroupModel, args: any, ctx: Context): Promise<MolecularDbModel[]> {
      return await ctx.entityManager.getCustomRepository(MolecularDbRepository)
        .findDatabases(ctx.user, undefined, group.id)
    },

    async numDatabases(group: GroupModel & Scope, args: any, ctx: Context): Promise<number> {
      return await ctx.entityManager.getCustomRepository(MolecularDbRepository)
        .countDatabases(ctx.user, undefined, group.id)
    },
  },

  Query: {
    async group(_: any, { groupId }: any, ctx: Context): Promise<LooselyCompatible<Group & Scope> | null> {
      const group = await ctx.entityManager.getRepository(GroupModel).findOne(groupId)
      if (group != null) {
        const scopeRole = await resolveGroupScopeRole(ctx, groupId)
        return { ...group, scopeRole }
      } else {
        return null
      }
    },

    async groupByUrlSlug(_: any, { urlSlug }: any, ctx: Context): Promise<LooselyCompatible<Group & Scope> | null> {
      const group = await ctx.entityManager.createQueryBuilder(GroupModel, 'grp')
        .where(urlSlugMatchesClause('grp', urlSlug))
        .getOne()
      if (group != null) {
        const scopeRole = await resolveGroupScopeRole(ctx, group.id)
        return { ...group, scopeRole }
      } else {
        return null
      }
    },

    async countReviews(_: any, args: any, ctx: Context): Promise<number|null> {
      // @ts-ignore
      const { sessionStore } : any = ctx.req
      if (sessionStore) {
        try {
          const redisClient = sessionStore.client
          const countKey = 'publications:count-review'
          const DAYS = 7
          const HOURS = 24
          const MINUTES = 60
          const SECONDS = 60

          // transform get in async
          const publicationsCount : string | any = await new Promise((resolve, reject) => {
            redisClient.get(countKey, (err: any, res: string) => {
              if (err) {
                reject(err)
              }
              resolve(res)
            })
          })

          if (publicationsCount) {
            return parseInt(publicationsCount, 10)
          } else {
            const res = await
            fetch('https://serpapi.com/search?' + new URLSearchParams({
              engine: 'google_scholar',
              q: '"METASPACE" AND ("imaging mass spectrometry" OR "mass spectrometry imaging") AND "Review article"',
              api_key: config.google.serpapi_key,
            }).toString(), {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                mode: 'no-cors',
              },
            })
            const data : string = await res.text()
            const dataJson = JSON.parse(data)
            const nOfPublications = dataJson.search_information.total_results

            redisClient.set(countKey, nOfPublications, 'EX', DAYS * HOURS * MINUTES * SECONDS)
            return parseInt(nOfPublications, 10)
          }
        } catch (e) {
          console.error(e)
          return null
        }
      } else {
        return null
      }
    },

    async countPublications(_: any, args: any, ctx: Context): Promise<number|null> {
      // @ts-ignore
      const { sessionStore } : any = ctx.req
      if (sessionStore) {
        try {
          const redisClient = sessionStore.client
          const countKey = 'publications:count'
          const DAYS = 7
          const HOURS = 24
          const MINUTES = 60
          const SECONDS = 60

          // transform get in async
          const publicationsCount : string | any = await new Promise((resolve, reject) => {
            redisClient.get(countKey, (err: any, res: string) => {
              if (err) {
                reject(err)
              }
              resolve(res)
            })
          })

          if (publicationsCount) {
            return parseInt(publicationsCount, 10)
          } else {
            const res = await
            fetch('https://serpapi.com/search?' + new URLSearchParams({
              engine: 'google_scholar',
              q: '"METASPACE" AND ("imaging mass spectrometry" OR "mass spectrometry imaging")',
              api_key: config.google.serpapi_key,
            }).toString(), {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                mode: 'no-cors',
              },
            })
            const data : string = await res.text()
            const dataJson = JSON.parse(data)
            const nOfPublications = dataJson.search_information.total_results

            redisClient.set(countKey, nOfPublications, 'EX', DAYS * HOURS * MINUTES * SECONDS)
            return parseInt(nOfPublications, 10)
          }
        } catch (e) {
          console.error(e)
          return null
        }
      } else {
        return null
      }
    },

    async countGroups(_: any, args: any, ctx: Context): Promise<number|null> {
      return await ctx.entityManager.getRepository(GroupModel)
        .createQueryBuilder('group')
        .getCount()
    },

    async allGroups(_: any, { query, useRole }: any, ctx: Context): Promise<LooselyCompatible<Group & Scope>[]|null> {
      let userGroups : any = []

      let qb = ctx.entityManager.createQueryBuilder(GroupModel,
        'group')
        .leftJoinAndSelect('group.members', 'userGroup')

      if (query) {
        qb = qb.where('(group.name ILIKE :query OR group.shortName ILIKE :query)', { query: `%${query}%` })
      }

      if (useRole && ctx.user.role !== 'admin') {
        qb = qb.andWhere('userGroup.user = :userId', { userId: ctx.user.id })
      }

      userGroups = await qb.orderBy('group.name')
        .distinct(true)
        .getMany()

      return userGroups.map((g: any) => ({ ...g, scopeRole: g.role }))
    },

    async groupUrlSlugIsValid(source: any, { urlSlug, existingGroupId }: any, ctx: Context): Promise<boolean> {
      await validateUrlSlugChange(ctx.entityManager, GroupModel, existingGroupId, urlSlug)
      return true
    },
  },

  Mutation: {
    async createGroup(
      _: any, { groupDetails }: any, { user, entityManager }: Context
    ): Promise<LooselyCompatible<Group & Scope>> {
      const { groupAdminEmail, ...groupInput } = groupDetails
      assertUserAuthenticated(user)
      logger.info(`Creating ${groupInput.name} group by '${user.id}' user...`)

      if (groupDetails.urlSlug != null) {
        await validateUrlSlugChange(entityManager, GroupModel, null, groupDetails.urlSlug)
      }

      const group = await entityManager.getRepository(GroupModel).save(groupInput) as GroupModel

      const adminUser = await findUserByEmail(entityManager, groupAdminEmail)
        || await findUserByEmail(entityManager, groupAdminEmail, 'not_verified_email')
        || await createInactiveUser(groupAdminEmail)

      await entityManager.getRepository(UserGroupModel).save({
        groupId: group.id,
        userId: adminUser.id,
        role: UserGroupRoleOptions.GROUP_ADMIN,
      })

      logger.info(`${groupInput.name} group created`)
      return group
    },

    async updateGroup(_: any, { groupId, groupDetails }: any, { user, entityManager }: Context): Promise<Group> {
      await assertCanEditGroup(entityManager, user, groupId)
      if (groupDetails.urlSlug != null) {
        await validateUrlSlugChange(entityManager, GroupModel, groupId, groupDetails.urlSlug)
      }
      logger.info(`Updating '${groupId}' group by '${user.id}' user...`)
      const groupRepo = entityManager.getRepository(GroupModel)
      const group = { ...(await groupRepo.findOneOrFail(groupId)), ...groupDetails }
      await groupRepo.save(group) // update doesn't return updated object;
      if (groupDetails.name || groupDetails.shortName) {
        logger.info(`Updating '${groupId}' group datasets...`)
        const groupDSs = await entityManager.getRepository(DatasetModel).find({ groupId })
        await Promise.all(groupDSs.map(async ds => {
          await smApiUpdateDataset(ds.id, { groupId }, { asyncEsUpdate: true })
        }))
      }
      logger.info(`'${groupId}' group updated`)
      return group
    },

    async deleteGroup(_: any, { groupId }: any, { user, entityManager }: Context): Promise<boolean> {
      await assertCanEditGroup(entityManager, user, groupId)
      logger.info(`Deleting '${groupId}' group by '${user.id}' user...`)

      await entityManager.getRepository(UserGroupModel).delete({ groupId })
      await entityManager.getRepository(GroupModel).delete(groupId)

      logger.info(`'${groupId}' group deleted`)
      return true
    },

    async leaveGroup(_: any, { groupId }: any, { getUserIdOrFail, entityManager }: Context): Promise<boolean> {
      const userId = getUserIdOrFail()
      logger.info(`'${userId}' user leaving '${groupId}' group...`)
      await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)

      const userGroup = await userGroupRepo.findOneOrFail({ userId, groupId })
      if (userGroup.role === UserGroupRoleOptions.GROUP_ADMIN) {
        throw new UserError('Group admin cannot leave group')
      }

      await userGroupRepo.delete({ userId, groupId })

      await updateUserGroupDatasets(entityManager, userId, groupId, false)
      logger.info(`User '${userId}' left '${groupId}' group`)
      return true
    },

    async removeUserFromGroup(_: any, { groupId, userId }: any, { user, entityManager }: Context): Promise<boolean> {
      await assertCanEditGroup(entityManager, user, groupId)
      logger.info(`User '${user.id}' removing '${userId}' user from '${groupId}' group...`)

      await entityManager.getRepository(GroupModel).findOneOrFail(groupId)
      await entityManager.getRepository(UserModel).findOneOrFail(userId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)

      const currUserGroup = await userGroupRepo.findOneOrFail({ userId, groupId })
      if (currUserGroup.role === UserGroupRoleOptions.GROUP_ADMIN && userId === user.id) {
        throw new UserError('Group admin cannot remove themselves from group')
      }
      await userGroupRepo.delete({ userId, groupId })

      await updateUserGroupDatasets(entityManager, userId, groupId, false)
      logger.info(`User '${userId}' was removed from '${groupId}' group`)
      return true
    },

    async requestAccessToGroup(
      _: any, { groupId }: any, { getUserIdOrFail, entityManager }: Context
    ): Promise<UserGroupModel> {
      const userId = getUserIdOrFail()
      logger.info(`User '${userId}' requesting access to '${groupId}' group...`)
      const user = await entityManager.getRepository(UserModel).findOneOrFail(userId)
      const group = await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)
      let userGroup = await userGroupRepo.findOne({ where: { groupId, userId } })

      if (!userGroup) {
        userGroup = userGroupRepo.create({
          userId,
          groupId,
          role: UserGroupRoleOptions.PENDING,
          primary: true,
        })
        await userGroupRepo.save(userGroup)

        const managers = await entityManager.getRepository(UserGroupModel)
          .find({ where: { groupId, role: UserGroupRoleOptions.GROUP_ADMIN }, relations: ['user'] })
        managers.forEach(manager => {
          sendRequestAccessEmail('group', manager.user, user, group)
        })
      }

      logger.info(`User '${userId}' requested access to '${groupId}' group`)
      return await userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group'],
      })
    },

    async acceptRequestToJoinGroup(
      _: any, { groupId, userId }: any, { user, entityManager }: Context
    ): Promise<UserGroupModel> {
      await assertCanEditGroup(entityManager, user, groupId)
      logger.info(`User '${user.id}' accepting request from '${userId}' user to join '${groupId}' group...`)

      const userModel = await entityManager.getRepository(UserModel).findOneOrFail(userId)
      const group = await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)

      const reqUserGroup = await userGroupRepo.findOne({ userId, groupId })
      if (!reqUserGroup) {
        throw new UserError(`User '${userId}' did not request to join '${groupId}' group`)
      }

      if (reqUserGroup.role === UserGroupRoleOptions.PENDING) {
        await userGroupRepo.save({
          userId,
          groupId,
          role: UserGroupRoleOptions.MEMBER,
        })

        sendAcceptanceEmail('group', userModel, group)
      }

      await updateUserGroupDatasets(entityManager, userId, groupId, true)
      logger.info(`User '${userId}' was accepted to '${groupId}' group`)
      return userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group'],
      })
    },

    async inviteUserToGroup(
      _: any, { groupId, email }: any, { user, getUserIdOrFail, entityManager }: Context
    ): Promise<UserGroupModel> {
      email = email.trim() // Trim spaces at the ends, because copy+pasting email addresses often adds unwanted spaces
      await assertCanEditGroup(entityManager, user, groupId)
      logger.info(`User '${user.id}' inviting ${email} to join '${groupId}' group...`)

      const currentUser = await entityManager.getRepository(UserModel).findOneOrFail(getUserIdOrFail())
      let invUser = await findUserByEmail(entityManager, email, 'email')
        || await findUserByEmail(entityManager, email, 'not_verified_email')
      const isNewUser = !invUser
      if (!invUser) {
        invUser = await createInactiveUser(email)
        const link = `${config.web_public_url}/account/create-account`
        sendInvitationEmail(email, currentUser.name || '', link)
      }
      const group = await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)

      let invUserGroup = await userGroupRepo.findOne({
        where: { userId: invUser.id, groupId },
      })

      if (invUserGroup && [UserGroupRoleOptions.MEMBER,
        UserGroupRoleOptions.GROUP_ADMIN].includes(invUserGroup.role)) {
        logger.info(`User '${invUserGroup.userId}' is already member of '${groupId}'`)
      } else {
        invUserGroup = await userGroupRepo.save({
          userId: invUser.id,
          groupId,
          role: UserGroupRoleOptions.INVITED,
        }) as UserGroupModel
        logger.info(`'${invUserGroup.userId}' user was invited to '${groupId}' group`)

        if (!isNewUser) {
          sentGroupOrProjectInvitationEmail('group', invUser, currentUser, group)
        }
      }

      return await userGroupRepo.findOneOrFail({
        where: { userId: invUser.id, groupId },
        relations: ['user', 'group'],
      })
    },

    async acceptGroupInvitation(
      _: any, { groupId }: any, { getUserIdOrFail, entityManager }: Context
    ): Promise<UserGroupModel> {
      const userId = getUserIdOrFail()
      logger.info(`User '${userId}' accepting invitation to join '${groupId}' group...`)
      await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      const userGroupRepo = entityManager.getRepository(UserGroupModel)

      const userGroup = await userGroupRepo.findOneOrFail({
        where: { userId: userId, groupId },
      })
      if (userGroup.role === UserGroupRoleOptions.INVITED) {
        await userGroupRepo.save({
          userId: userId,
          groupId,
          role: UserGroupRoleOptions.MEMBER,
        })
      }

      await updateUserGroupDatasets(entityManager, userId, groupId, true)

      logger.info(`User '${userId}' accepted invitation to '${groupId}' group`)
      return await userGroupRepo.findOneOrFail({
        where: { userId: userId, groupId },
        relations: ['user', 'group'],
      })
    },

    async updateUserGroup(
      _: any, { groupId, userId, update }: any, { user, entityManager }: Context
    ): Promise<boolean> {
      await assertCanEditGroup(entityManager, user, groupId)
      logger.info(`Updating '${groupId}' '${userId}' membership by '${user.id}' user...`)

      if (update.role != null) {
        await entityManager.getRepository(UserGroupModel).save({
          userId, groupId, role: update.role,
        })
      } else {
        await entityManager.getRepository(UserGroupModel).delete({ userId, groupId })
      }

      const groupApproved = [UserGroupRoleOptions.MEMBER, UserGroupRoleOptions.GROUP_ADMIN].includes(update.role)
      await updateUserGroupDatasets(entityManager, userId, groupId, groupApproved)

      return true
    },

    async importDatasetsIntoGroup(
      _: any, { groupId, datasetIds }: any, { user, entityManager }: Context
    ): Promise<boolean> {
      await assertCanAddDataset(entityManager, user, groupId)
      logger.info(`User '${user.id}' importing datasets ${datasetIds} to '${groupId}' group...`)

      await entityManager.getRepository(GroupModel).findOneOrFail(groupId)

      // Verify user is allowed to edit the datasets
      await Promise.all(datasetIds.map(async(dsId: string) => {
        await getDatasetForEditing(entityManager, user, dsId)
      }))

      const dsRepo = entityManager.getRepository(DatasetModel)
      await Promise.all(datasetIds.map(async(dsId: string) => {
        await dsRepo.update(dsId, { groupId, groupApproved: true })
        await smApiUpdateDataset(dsId, { groupId }, { asyncEsUpdate: true })
      }))
      logger.info(`User '${user.id}' imported datasets to '${groupId}' group`)
      return true
    },
  },
}
