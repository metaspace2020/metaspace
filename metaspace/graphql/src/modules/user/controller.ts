import { UserError } from 'graphql-errors'
import { In } from 'typeorm'
import * as uuid from 'uuid'

import { UserGroup } from '../../binding'
import { User as UserModel } from './model'
import { Dataset as DatasetModel } from '../dataset/model'
import { Credentials as CredentialsModel } from '../auth/model'
import { UserGroup as UserGroupModel, UserGroupRoleOptions } from '../group/model'
import { UserProject as UserProjectModel } from '../project/model'
import { AuthMethod, AuthMethodOptions, Context, ContextUser } from '../../context'
import { ScopeRoleOptions as SRO, UserProjectSource, UserSource } from '../../bindingTypes'
import { findUserById, resetUserApiKey, sendEmailVerificationToken, signout } from '../auth/operation'
import { LooselyCompatible } from '../../utils'
import logger from '../../utils/logger'
import { convertUserToUserSource } from './util/convertUserToUserSource'
import { smApiUpdateDataset } from '../../utils/smApi/datasets'
import { deleteDataset } from '../dataset/operation/deleteDataset'
import { resolveGroupScopeRole } from '../group/util/resolveGroupScopeRole'
import canSeeUserEmail from './util/canSeeUserEmail'
import { ProjectSourceRepository } from '../project/ProjectSourceRepository'
import { getUserSourceById, resolveUserScopeRole } from './util/getUserSourceById'
import { Plan } from '../plan/model'
import * as moment from 'moment'
import { getDeviceInfo, hashIp, performAction } from '../plan/util/canPerformAction'
import { sendContactEmail } from '../auth/email'

const assertCanEditUser = (user: ContextUser, userId: string) => {
  if (!user.id) {
    throw new UserError('Not authenticated')
  }

  if (user.role !== 'admin' && user.id !== userId) {
    throw new UserError('Access denied')
  }
}

export const Resolvers = {
  User: {
    async primaryGroup({ scopeRole, ...user }: UserSource, _: any,
      ctx: Context): Promise<LooselyCompatible<UserGroup>|null> {
      let criteria
      if (scopeRole === SRO.PROFILE_OWNER || ctx.isAdmin) {
        criteria = { userId: user.id, primary: true }
      } else {
        criteria = {
          userId: user.id,
          primary: true,
          role: In([UserGroupRoleOptions.GROUP_ADMIN, UserGroupRoleOptions.MEMBER]),
        }
      }
      return await ctx.entityManager.getRepository(UserGroupModel).findOne({
        where: criteria,
        relations: ['group', 'user'],
      }) || null
    },

    async groups(
      { scopeRole, ...user }: UserSource,
      _: any,
      ctx: Context
    ): Promise<LooselyCompatible<UserGroup>[]|null> {
      if (scopeRole === SRO.PROFILE_OWNER || ctx.isAdmin) {
        const userGroups = await ctx.entityManager.getRepository(UserGroupModel).find({
          where: { userId: user.id },
          relations: ['group', 'user'],
        })
        return await Promise.all(userGroups.map(async userGroup => {
          return {
            ...userGroup,
            group: {
              ...userGroup.group,
              scopeRole: await resolveGroupScopeRole(ctx, userGroup.group.id),
            },
          }
        }))
      }
      return null
    },

    async projects(user: UserSource, args: any, ctx: Context): Promise<UserProjectSource[]|null> {
      if (user.scopeRole === SRO.PROFILE_OWNER || ctx.isAdmin) {
        const userProjects = await ctx.entityManager.getRepository(UserProjectModel)
          .find({ userId: user.id })
        // Exclude projects that user isn't allowed to see (e.g. private projects in PENDING status)
        const visibleProjects = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
          .findProjectsByIds(ctx.user, userProjects.map(p => p.projectId))
        const visibleProjectIds = visibleProjects.map(p => p && p.id)
        return userProjects
          .filter(userProject => visibleProjectIds.includes(userProject.projectId))
          .map(userProject => ({ ...userProject, user }))
      }
      return null
    },

    email({ scopeRole, ...user }: UserSource, args: any, ctx: Context): string|null {
      if (canSeeUserEmail(scopeRole) || ctx.isAdmin) {
        return user.email || user.notVerifiedEmail || null
      }
      return null
    },

    role({ scopeRole, ...user }: UserSource, args: any, ctx: Context): string|null {
      if (scopeRole === SRO.PROFILE_OWNER || ctx.isAdmin) {
        return user.role || null
      }
      return null
    },

    async plan(user: UserSource, args: any, ctx: Context): Promise<Plan|undefined> {
      return await ctx.entityManager.createQueryBuilder(Plan, 'plan')
        .where('plan.id = :id', { id: user.planId })
        .getOne()
    },

    async apiKey({ scopeRole, id: userId }: UserSource, args: any, ctx: Context): Promise<string|null> {
      const allowedAuthMethods: AuthMethod[] = [AuthMethodOptions.JWT, AuthMethodOptions.SESSION]
      if ((scopeRole === SRO.PROFILE_OWNER || ctx.isAdmin)
        && allowedAuthMethods.includes(ctx.user.authMethod)) {
        const userModel = await findUserById(userId, true)
        return userModel && userModel.credentials && userModel.credentials.apiKey || null
      } else {
        return null
      }
    },
  },

  Query: {
    async user(_: any, { userId }: any, ctx: Context): Promise<UserSource|null> {
      return await getUserSourceById(ctx, userId)
    },

    async currentUser(_: any, args: any, ctx: Context): Promise<UserSource|null> {
      if (ctx.user.id != null) {
        return await getUserSourceById(ctx, ctx.user.id)
      }
      return null
    },

    async countUsers(_: any, { query, filter }: any, ctx: Context): Promise<number> {
      const qb = ctx.entityManager.getRepository(UserModel)
        .createQueryBuilder('user')

      // Apply query filter
      if (query) {
        qb.where('user.name ILIKE \'%\' || :query || \'%\'', { query })
          .orWhere('user.email ILIKE :query || \'%\'', { query })
          .orWhere('user.notVerifiedEmail ILIKE :query || \'%\'', { query })
      }

      // Apply filters
      if (filter?.name) {
        qb.andWhere('user.name ILIKE \'%\' || :name || \'%\'', { name: filter.name })
      }
      if (filter?.email) {
        qb.andWhere('(user.email ILIKE :email || \'%\' OR user.notVerifiedEmail ILIKE :email || \'%\')',
          { email: filter.email })
      }
      if (filter?.role) {
        qb.andWhere('user.role = :role', { role: filter.role })
      }
      if (filter?.planId) {
        qb.andWhere('user.planId = :planId', { planId: filter.planId })
      }
      if (filter?.userId) {
        qb.andWhere('user.id = :userId', { userId: filter.userId })
      }

      return await qb.getCount()
    },

    async allUsers(_: any, { query, orderBy, sortingOrder, filter, offset, limit }: any,
      ctx: Context): Promise<UserSource[]|null> {
      if (ctx.isAdmin) {
        const qb = ctx.entityManager.getRepository(UserModel)
          .createQueryBuilder('user')

        // Keep original query filtering
        if (query) {
          qb.where('user.name ILIKE \'%\' || :query || \'%\'', { query })
            .orWhere('user.email ILIKE :query || \'%\'', { query })
            .orWhere('user.notVerifiedEmail ILIKE :query || \'%\'', { query })
        }

        // Additional filters
        if (filter.name) {
          qb.andWhere('user.name ILIKE \'%\' || :name || \'%\'', { name: filter.name })
        }
        if (filter.email) {
          qb.andWhere('(user.email ILIKE :email || \'%\' OR user.notVerifiedEmail ILIKE :email || \'%\')',
            { email: filter.email })
        }
        if (filter.role) {
          qb.andWhere('user.role = :role', { role: filter.role })
        }
        if (filter.planId) {
          qb.andWhere('user.planId = :planId', { planId: filter.planId })
        }
        if (filter.userId) {
          qb.andWhere('user.id = :userId', { userId: filter.userId })
        }

        // Apply ordering
        const direction = sortingOrder === 'DESCENDING' ? 'DESC' : 'ASC'
        switch (orderBy) {
          case 'ORDER_BY_NAME':
            qb.orderBy('user.name', direction)
            break
          case 'ORDER_BY_EMAIL':
            qb.orderBy('user.email', direction)
            break
          case 'ORDER_BY_ROLE':
            qb.orderBy('user.role', direction)
            break
          case 'ORDER_BY_DATE':
            qb.orderBy('user.createdAt', direction)
            break
          case 'ORDER_BY_UPDATED_AT':
            qb.orderBy('user.updatedAt', direction)
            break
          case 'ORDER_BY_PLAN_ID':
            qb.orderBy('user.planId', direction)
            break
          default:
            qb.orderBy('user.name', direction)
        }

        // Apply pagination
        qb.skip(offset)
        qb.take(limit)

        const users = await qb.getMany()
        const promises = users.map(user =>
          convertUserToUserSource(user, resolveUserScopeRole(ctx, user.id)))
        return Promise.all(promises)
      } else {
        return null
      }
    },
  },

  Mutation: {
    async updateUser(_: any, { userId, update }: any, ctx: Context): Promise<UserSource> {
      const { user, isAdmin, entityManager } = ctx
      assertCanEditUser(user, userId)
      logger.info(`User '${userId}' being updated by '${user.id}'...`)

      if (update.role && !isAdmin) {
        throw new UserError('Only admin can update role')
      }

      if (update.planId && !isAdmin) {
        throw new UserError('Only admin can update plan')
      }

      let userObj = await entityManager.getRepository(UserModel).findOneOrFail({
        where: { id: userId },
        relations: ['credentials'],
      })
      if (update.email) {
        // Check if the email is already in use
        const existingUser = await entityManager.getRepository(UserModel).findOne({
          where: { email: update.email },
        })
        if (existingUser && existingUser.id !== userId) { // email is already in use
          throw new UserError('There was an error updating the user. Contact the administrator.')
        }

        await sendEmailVerificationToken(userObj.credentials, update.email)
      }
      update.updatedAt = moment.utc()
      const { email: notVerifiedEmail, primaryGroupId, ...rest } = update
      userObj = await entityManager.getRepository(UserModel).save({
        ...userObj,
        ...rest,
        notVerifiedEmail,
      })

      if (primaryGroupId) {
        const userGroupRepo = entityManager.getRepository(UserGroupModel)
        const userGroups = await userGroupRepo.find({ where: { userId } })
        if (userGroups.length > 0) {
          const newPrimary = userGroups.find(ug => ug.groupId === primaryGroupId) || userGroups[0]
          userGroups.forEach(ug => {
            ug.primary = ug === newPrimary
          })
          await userGroupRepo.save(userGroups)
        }
      }

      if (update.name != null) {
        const userDSs = await entityManager.getRepository(DatasetModel).find({ userId })
        if (userDSs) {
          logger.info(`Updating user '${userId}' datasets...`)
          await Promise.all(userDSs.map(async ds => {
            await smApiUpdateDataset(ds.id, { submitterId: userId }, { asyncEsUpdate: true })
          }))
        }
      }

      const action: any = {
        actionType: 'update',
        userId,
        type: 'user',
        actionDt: moment.utc(moment.utc().toDate()),
        source: (ctx as any).getSource(),
        deviceInfo: getDeviceInfo(ctx?.req?.headers?.['user-agent']),
        canEdit: true,
        ipHash: hashIp(ctx?.req?.ip),
      }
      await performAction(ctx, action)

      logger.info(`User '${userId}' was updated`)
      return (await getUserSourceById(ctx, userObj.id))!
    },

    async deleteUser(
      _: any,
      { userId, deleteDatasets }: any,
      { req, user: currentUser, entityManager }: Context
    ): Promise<boolean> {
      assertCanEditUser(currentUser, userId)
      logger.info(`User '${userId}' being ${deleteDatasets ? 'hard-' : 'soft-'}deleted by '${currentUser.id}'...`)
      const userRepo = entityManager.getRepository(UserModel)
      const deletingUser = (await userRepo.findOneOrFail(userId))

      if (deleteDatasets) {
        const userDSs = await entityManager.getRepository(DatasetModel).find({ userId })
        logger.info(`Deleting user '${userId}' datasets...`)
        await Promise.all(userDSs.map(async ds => {
          await deleteDataset(entityManager, currentUser, ds.id)
        }))
        await entityManager.getRepository(DatasetModel).delete({ userId })

        await entityManager.getRepository(UserGroupModel).delete({ userId })
        await userRepo.delete({ id: userId })
        await entityManager.getRepository(CredentialsModel).delete({ id: deletingUser.credentialsId })
        logger.info(`User '${userId}' was hard-deleted`)
      } else {
        await entityManager.getRepository(UserGroupModel).delete({ userId })
        // Remove login methods to prevent login, and verify the email so that it can't be claimed as an inactive account
        await entityManager.getRepository(CredentialsModel).update({ id: deletingUser.credentialsId },
          { hash: null, googleId: null, emailVerified: true })
        // Make email invalid so that the password can't be reset
        const email = `${deletingUser.email || deletingUser.notVerifiedEmail}-DELETED-${uuid.v4()}`
        await entityManager.getRepository(UserModel).update({ id: userId },
          { email, notVerifiedEmail: null })

        logger.info(`User '${userId}' was soft-deleted`)
      }

      if (userId === currentUser.id) {
        await signout(req)
      }

      return true
    },

    async resetUserApiKey(_: any, { userId, removeKey }: any, ctx: Context): Promise<UserSource | null> {
      assertCanEditUser(ctx.user, userId)
      logger.info(`User '${userId}' API key is being ${removeKey ? 'removed' : 'reset'} by '${ctx.user.id}'.`)

      await resetUserApiKey(userId, removeKey)

      return await getUserSourceById(ctx, userId)
    },

    sendContactMessage(_: any, { email, name, category, message }: any, ctx: Context): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
      logger.info(`Sending contact message from '${email}'...`)
      sendContactEmail(email, name, category, message)
      return true
    },
  },
}
