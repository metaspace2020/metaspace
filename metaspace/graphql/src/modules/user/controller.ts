import {UserError} from "graphql-errors";
import {Like} from 'typeorm';
import * as uuid from 'uuid';

import {User, UserGroup} from '../../binding';
import {User as UserModel} from './model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Credentials as CredentialsModel} from '../auth/model';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../group/model';
import {UserProject as UserProjectModel} from '../project/model';
import {Context, ContextUser} from '../../context';
import {ScopeRole, ScopeRoleOptions as SRO, UserProjectSource, UserSource} from '../../bindingTypes';
import {sendEmailVerificationToken} from '../auth/operation';
import {logger, LooselyCompatible, smAPIRequest} from '../../utils';
import {convertUserToUserSource} from './util/convertUserToUserSource';
import {smAPIUpdateDataset} from '../../utils/smAPI';
import {deleteDataset} from '../dataset/operation/deleteDataset';
import {patchPassportIntoLiveRequest} from '../auth/middleware';

const assertCanEditUser = (user: ContextUser | null, userId: string) => {
  if (!user || !user.id)
    throw new UserError('Not authenticated');

  if (user.role !== 'admin' && user.id !== userId)
    throw new UserError('Access denied');
};

const resolveUserScopeRole = async (ctx: Context, userId?: string): Promise<ScopeRole> => {
  let scopeRole = SRO.OTHER;
  if (ctx.isAdmin) {
    scopeRole = SRO.ADMIN;
  }
  else {
    if (userId && ctx.user != null && userId === ctx.user.id) {
      scopeRole = SRO.PROFILE_OWNER;
    }
  }
  return scopeRole;
};

export const Resolvers = {
  User: {
    async primaryGroup({scopeRole, ...user}: UserSource, _: any,
                       ctx: Context): Promise<LooselyCompatible<UserGroup>|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return await ctx.connection.getRepository(UserGroupModel).findOne({
          where: { userId: user.id, primary: true },
          relations: ['group', 'user']
        }) || null
      }
      return null;
    },

    async groups({scopeRole, ...user}: UserSource, _: any, ctx: Context): Promise<LooselyCompatible<UserGroup>[]|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return await ctx.connection.getRepository(UserGroupModel).find({
          where: { userId: user.id },
          relations: ['group', 'user']
        });
      }
      return null;
    },

    async projects(user: UserSource, args: any, ctx: Context): Promise<UserProjectSource[]|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(user.scopeRole)) {
        const userProjects = await ctx.connection.getRepository(UserProjectModel)
          .find({userId: user.id});
        return userProjects.map(userProject => ({ ...userProject, user }));
      }
      return null;
    },

    async email({scopeRole, ...user}: UserSource): Promise<string|null> {
      if ([SRO.GROUP_MANAGER, SRO.PROJECT_MANAGER, SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return user.email || user.notVerifiedEmail || null;
      }
      return null;
    },

    async role({scopeRole, ...user}: UserSource): Promise<string|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return user.role || null;
      }
      return null;
    },
  },

  Query: {
    async user(_: any, {userId}: any, ctx: Context): Promise<UserSource|null> {
      const scopeRole = await resolveUserScopeRole(ctx, userId);
      const user = await ctx.connection.getRepository(UserModel).findOne({
        where: { id: userId }
      });
      return user != null ? convertUserToUserSource(user, scopeRole) : null;
    },

    async currentUser(_: any, {}: any, ctx: Context): Promise<UserSource|null> {
      if (ctx.user != null) {
        const scopeRole = await resolveUserScopeRole(ctx, ctx.user.id);
        const user = await ctx.connection.getRepository(UserModel).findOneOrFail({
          where: { id: ctx.user.id }
        });
        return convertUserToUserSource(user, scopeRole);
      }
      return null;
    },

    async allUsers(_: any, {query}: any, ctx: Context): Promise<UserSource[]|null> {
      if (ctx.isAdmin) {
        const users = await ctx.connection.getRepository(UserModel)
          .createQueryBuilder('user')
          .where(`user.name ILIKE '%' || :query || '%'`, {query})
          .orWhere(`user.email ILIKE :query || '%'`, {query})
          .orWhere(`user.notVerifiedEmail ILIKE :query || '%'`, {query})
          .orderBy(`user.name`)
          .getMany() as UserModel[];
        const promises = users.map(async user =>
          convertUserToUserSource(user, await resolveUserScopeRole(ctx, user.id)));
        return Promise.all(promises);
      } else {
        return null;
      }
    }
  },

  Mutation: {
    async updateUser(_: any, {userId, update}: any, {user, isAdmin, connection}: Context): Promise<User> {
      assertCanEditUser(user, userId);
      logger.info(`User '${userId}' being updated by '${user!.id}'...`);

      if (update.role && !isAdmin) {
        throw new UserError('Only admin can update role');
      }

      let userObj = await connection.getRepository(UserModel).findOneOrFail({
        where: { id: userId },
        relations: ['credentials']
      }) as UserModel;
      if (update.email) {
        await sendEmailVerificationToken(userObj.credentials, update.email);
      }
      const {email: notVerifiedEmail, primaryGroupId, ...rest} = update;
      userObj = await connection.getRepository(UserModel).save({
        ...userObj,
        ...rest,
        notVerifiedEmail
      });

      if (primaryGroupId) {
        const userGroupRepo = connection.getRepository(UserGroupModel);
        const userGroups = await userGroupRepo.find({ where: { userId } }) as UserGroupModel[];
        if (userGroups.length > 0) {
          const newPrimary = userGroups.find(ug => ug.groupId === primaryGroupId) || userGroups[0];
          userGroups.forEach(ug => {
            ug.primary = ug === newPrimary;
          });
          await userGroupRepo.save(userGroups);
        }
      }

      const userDSs = await connection.getRepository(DatasetModel).find({ userId });
      if (userDSs) {
        logger.info(`Updating user '${userId}' datasets...`);
        await Promise.all(userDSs.map(async ds => {
          await smAPIUpdateDataset(ds.id, {submitterId: userId});
        }));
      }

      logger.info(`User '${userId}' was updated`);
      return {
        id: userObj.id,
        name: userObj.name!,
        role: userObj.role
      };
    },

    async deleteUser(_: any, {userId, deleteDatasets}: any, {req, res, user: currentUser, connection}: Context): Promise<Boolean> {
      assertCanEditUser(currentUser, userId);
      logger.info(`User '${userId}' being ${deleteDatasets ? 'hard-' : 'soft-'}deleted by '${currentUser!.id}'...`);
      const userRepo = await connection.getRepository(UserModel);
      const deletingUser = (await userRepo.findOneOrFail(userId));

      if (deleteDatasets) {
        const userDSs = await connection.getRepository(DatasetModel).find({ userId });
        logger.info(`Deleting user '${userId}' datasets...`);
        await Promise.all(userDSs.map(async ds => {
          await deleteDataset(connection, currentUser!, ds.id);
        }));
        await connection.getRepository(DatasetModel).delete({userId});


        await connection.getRepository(UserGroupModel).delete({userId});
        await userRepo.delete({ id: userId });
        await connection.getRepository(CredentialsModel).delete({ id: deletingUser.credentialsId });
        logger.info(`User '${userId}' was hard-deleted`);
      } else {
        await connection.getRepository(UserGroupModel).delete({userId});
        // Remove login methods to prevent login, and verify the email so that it can't be claimed as an inactive account
        await connection.getRepository(CredentialsModel).update({ id: deletingUser.credentialsId },
          { hash: null, googleId: null, emailVerified: true });
        // Make email invalid so that the password can't be reset
        const email = `${deletingUser.email || deletingUser.notVerifiedEmail}-DELETED-${uuid.v4()}`;
        await connection.getRepository(UserModel).update({id: userId},
          {email, notVerifiedEmail: null});

        logger.info(`User '${userId}' was soft-deleted`);
      }

      await patchPassportIntoLiveRequest(req, res);
      req.logout();

      return true;
    },
  }
};
