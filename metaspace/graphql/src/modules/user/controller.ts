import {UserError} from "graphql-errors";
import {FindManyOptions, Like, In} from 'typeorm';

import {User, UserGroup} from '../../binding';
import {User as UserModel} from './model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Credentials as CredentialsModel} from '../auth/model';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../group/model';
import {Context, Scope, ScopeRole, ScopeRoleOptions as SRO} from '../../context';
import {JwtUser} from '../auth/controller';
import {sendEmailVerificationToken} from '../auth/operation';
import {LooselyCompatible} from '../../utils';

const assertCanEditUser = (user: JwtUser, userId?: string) => {
  if (!user)
    throw new UserError('Access denied');

  if (userId) {
    if (user.role !== 'admin' && user.id !== userId)
      throw new UserError('Access denied');
  }
  else {
    if (user.role !== 'admin')
      throw new UserError('Access denied');
  }
};

const resolveUserScopeRole = async (ctx: Context, userId?: string): Promise<ScopeRole> => {
  let scopeRole = SRO.OTHER;
  if (ctx.user.role === 'admin') {
    scopeRole = SRO.ADMIN;
  }
  else {
    if (userId) {
      if (userId === ctx.user.id) {
        scopeRole = SRO.PROFILE_OWNER;
      }
    }
  }
  return scopeRole;
};

export const Resolvers = {
  User: {
    async primaryGroup({scopeRole, ...user}: User & Scope, _: any,
                       ctx: Context): Promise<LooselyCompatible<UserGroup>|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return await ctx.connection.getRepository(UserGroupModel).findOne({
          where: { userId: user.id, primary: true },
          relations: ['group', 'user']
        }) || null
      }
      return null;
    },

    async groups({scopeRole, ...user}: User & Scope, _: any, ctx: Context): Promise<LooselyCompatible<UserGroup>[]|null> {
      if ([SRO.ADMIN, SRO.PROFILE_OWNER].includes(scopeRole)) {
        return await ctx.connection.getRepository(UserGroupModel).find({
          where: { userId: user.id },
          relations: ['group', 'user']
        });
      }
      return null;
    },

    async email({scopeRole, ...user}: User & Scope): Promise<string|null> {
      if ([SRO.GROUP_MANAGER,
        SRO.ADMIN,
        SRO.PROFILE_OWNER].includes(scopeRole)) {
        return user.email || null;
      }
      return null;
    }
  },

  Query: {
    async user(_: any, {userId}: any, ctx: Context): Promise<LooselyCompatible<User & Scope>|null> {
      const scopeRole = await resolveUserScopeRole(ctx, userId);
      if ([SRO.PROFILE_OWNER, SRO.ADMIN].includes(scopeRole)) {
        const user = await ctx.connection.getRepository(UserModel).findOneOrFail({
          where: { id: userId },
          relations: ['credentials']
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          scopeRole
        };
      }
      return null;
    },

    async currentUser(_: any, {}: any, ctx: Context): Promise<LooselyCompatible<User & Scope>|null> {
      const scopeRole = await resolveUserScopeRole(ctx, ctx.user.id);
      if ([SRO.PROFILE_OWNER, SRO.ADMIN].includes(scopeRole)) {
        const user = await ctx.connection.getRepository(UserModel).findOneOrFail({
          where: { id: ctx.user.id },
          relations: ['credentials']
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          scopeRole
        };
      }
      return null;
    },

    async allUsers(_: any, {query}: any, ctx: Context): Promise<LooselyCompatible<User & Scope>[]|null> {
      const scopeRole = await resolveUserScopeRole(ctx, ctx.user.id);
      if ([SRO.ADMIN].includes(scopeRole)) {
        const users = await ctx.connection.getRepository(UserModel).find({
          where: {name: Like(`%${query}%`)},
          relations: ['credentials']
        }) as UserModel[];
        return users.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          scopeRole
        }));
      }
      return null;
    }
  },

  Mutation: {
    async updateUser(_: any, {userId, update}: any, {user, connection}: any): Promise<User> {
      assertCanEditUser(user, userId);

      if (update.role && update.role !== 'admin') {
        throw new UserError('Only admin can update role');
      }
      if (update.primaryGroupId) {
        throw new UserError('Not implemented yet');
      }

      let userObj = await connection.getRepository(UserModel).findOneOrFail({
        where: { id: userId },
        relations: ['credentials']
      }) as UserModel;
      if (update.email) {
        await sendEmailVerificationToken(userObj.credentials, update.email);
      }
      const {email: notVerifiedEmail, ...rest} = update;
      userObj = {
        ...userObj,
        ...rest,
        notVerifiedEmail
      };
      return await connection.getRepository(UserModel).save(userObj);
    },

    async deleteUser(_: any, {userId, deleteDatasets}: any, {user, connection}: any): Promise<Boolean> {
      assertCanEditUser(user, userId);

      if (deleteDatasets) {
        throw new UserError('Not implemented yet');
      }

      const userRepo = await connection.getRepository(UserModel);
      let credentialsId = (await userRepo.findOneOrFail(userId)).credentialsId;

      await connection.getRepository(DatasetModel).delete({userId});
      await connection.getRepository(UserGroupModel).delete({userId});
      await userRepo.delete(userId);
      await connection.getRepository(CredentialsModel).delete(credentialsId);
      return true;
    },
  }
};
