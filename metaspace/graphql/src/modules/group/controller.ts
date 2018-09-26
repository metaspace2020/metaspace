import {UserError} from 'graphql-errors';
import {Connection, Like, In} from 'typeorm';

import {Group as GroupModel, UserGroup as UserGroupModel, UserGroupRoleOptions} from './model';
import {User as UserModel} from '../user/model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Group, UserGroup, User} from '../../binding';
import {Context, Scope, ScopeRole, ScopeRoleOptions} from '../../context';
import {LooselyCompatible} from '../../utils';

const findUserByEmail = async (connection: Connection, email: string) => {
  return await connection.getRepository(UserModel)
    .createQueryBuilder()
    .where('LOWER(email) = :email', {'email': email.toLowerCase()})
    .getOne();
};

const resolveGroupScopeRole = async (ctx: Context, groupId?: string): Promise<ScopeRole> => {
  let scopeRole = ScopeRoleOptions.OTHER;
  if (ctx.user.role === 'admin') {
    scopeRole = ScopeRoleOptions.ADMIN;
  }
  else {
    if (groupId) {
      const userGroup = await ctx.connection.getRepository(UserGroupModel).findOne({
        where: { userId: ctx.user.id, groupId }
      });
      if (userGroup) {
        if (userGroup.role == UserGroupRoleOptions.MEMBER) {
          scopeRole =  ScopeRoleOptions.GROUP_MEMBER;
        }
        else if (userGroup.role == UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR) {
          scopeRole = ScopeRoleOptions.GROUP_MANAGER;
        }
      }
    }
  }
  return scopeRole;
};

export const Resolvers = {
  UserGroup: {
    async numDatasets(userGroup: UserGroupModel, _: any, {connection}: any) {
      return await connection.getRepository(DatasetModel).count({
        where: {userId: userGroup.user.id}
      });
    }
  },

  Group: {
    async currentUserRole(group: GroupModel, _: any, {user, connection}: any) {
      const userGroup = await connection.getRepository(UserGroupModel).findOne({
        where: {
          userId: user.id,
          groupId: group.id
        }
      });
      return userGroup ? userGroup.role : null;
    },

    async members({scopeRole, ...group}: GroupModel & Scope,
                  _: any, ctx: Context): Promise<LooselyCompatible<UserGroup & Scope>[]|null> {
      if (!scopeRole || ![ScopeRoleOptions.GROUP_MEMBER,
        ScopeRoleOptions.GROUP_MANAGER,
        ScopeRoleOptions.ADMIN].includes(scopeRole)) {
        return null;
      }

      const userGroupModels = await ctx.connection.getRepository(UserGroupModel).find({
        where: { groupId: group.id },
        relations: ['user', 'group']
      });
      return userGroupModels.map(ug => ({
        user: {...ug.user, scopeRole},
        group: ug.group,
        role: ug.role
      }));
    }
  },

  Query: {
    async group(_: any, {groupId}: any, ctx: Context): Promise<LooselyCompatible<Group & Scope>> {
      const scopeRole = await resolveGroupScopeRole(ctx, groupId);

      const group = await ctx.connection.getRepository(GroupModel).findOneOrFail(groupId);
      return {
        ...group,
        scopeRole
      };
    },

    async groupByUrlSlug(_: any, {urlSlug}: any, ctx: Context): Promise<LooselyCompatible<Group & Scope>> {
      const group = await ctx.connection.getRepository(GroupModel).findOneOrFail({
        where: { urlSlug }
      });
      const scopeRole = await resolveGroupScopeRole(ctx, group.id);
      return {...group, scopeRole};
    },

    async allGroups(_: any, {query}: any, ctx: Context): Promise<LooselyCompatible<Group & Scope>[]|null> {
      const scopeRole = await resolveGroupScopeRole(ctx);
      const groups = await ctx.connection.getRepository(GroupModel).find({
        where: { 'name': Like(`%${query}%`) }
      });
      return groups.map(g => ({...g, scopeRole}));
    }
  },

  Mutation: {
    async createGroup(_: any, {groupDetails}: any, {user, connection}: any): Promise<Group> {
      if (!user || user.role !== 'admin')
        throw new UserError('Only admins can create groups');

      const {principalInvestigatorEmail, ...groupInput} = groupDetails;
      // TODO create inactive account for PI

      const insertRes = await connection.getRepository(GroupModel).insert(groupInput);
      const groupIdMap = insertRes.identifiers[0];
      return {...groupIdMap, ...groupInput};
    },

    async updateGroup(_: any, {groupId, groupDetails}: any, {user, connection}: any): Promise<Group> {
      // await checkAccessRights(connection, user, groupId);

      const groupRepo = connection.getRepository(GroupModel);
      let group = await groupRepo.findOneOrFail(groupId);
      return await groupRepo.save({...group, ...groupDetails});  // update doesn't return updated object;
    },

    async deleteGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      // await checkAccessRights(user, groupId);

      await connection.getRepository(UserGroupModel).delete({groupId});
      await connection.getRepository(GroupModel).delete(groupId);
      return true;
    },

    async leaveGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({ userId: user.id });
      if (userGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR)
        throw new UserError('Not implemented yet');

      await userGroupRepo.delete({ userId: user.id, groupId });
      return true;
    },

    async removeUserFromGroup(_: any, {groupId, userId}: any, {user, connection}: any): Promise<Boolean> {
      await connection.getRepository(GroupModel).findOneOrFail(groupId);
      await connection.getRepository(UserModel).findOneOrFail(userId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const currUserGroup = await userGroupRepo.findOneOrFail({ userId: user.id, groupId });
      if (currUserGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR) {
        if (userId === user.id)
          throw new UserError('Group PI cannot remove itself from group');

        await userGroupRepo.delete({ userId, groupId });
      }
      return true;
    },

    async requestAccessToGroup(_: any, {groupId}: any, {user, connection}: any): Promise<UserGroup> {
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);
      let userGroup = await userGroupRepo.findOne({ where: { groupId, userId: user.id } });

      if (!userGroup) {
        userGroup = userGroupRepo.create({
          userId: user.id,
          groupId,
          role: UserGroupRoleOptions.PENDING,
          primary: true
        });
        await userGroupRepo.save(userGroup);
      }

      return await userGroupRepo.findOneOrFail({
        where: { groupId, userId: user.id },
        relations: ['user', 'group']
      });
    },

    async acceptRequestToJoinGroup(_: any, {groupId, userId}: any, {user, connection}: any): Promise<UserGroup> {
      // await checkAccessRights(connection, user, groupId);

      await connection.getRepository(UserModel).findOneOrFail(userId);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const currUserGroup = await userGroupRepo.findOneOrFail({
        where: { userId: user.id, groupId }
      });
      const reqUserGroup = await userGroupRepo.findOne({
        where: { userId, groupId }
      });

      if (!reqUserGroup)
        throw new UserError(`User '${userId}' did not request to join '${groupId}' group`);

      if ((user.role === 'admin'
        || currUserGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR)
        && reqUserGroup.role == UserGroupRoleOptions.PENDING) {
        await userGroupRepo.save({
          userId,
          groupId,
          role: UserGroupRoleOptions.MEMBER
        });
      }

      return userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group']
      });
    },

    async inviteUserToGroup(_: any, {groupId, email}: any, {user, connection}: any): Promise<UserGroup> {
      // await checkAccessRights(connection, user, groupId);

      const invUser = await findUserByEmail(connection, email);
      if (!invUser)
        // TODO: send sign up invitation
        throw new UserError('Not Implemented Yet');
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const currUserGroup = await userGroupRepo.findOneOrFail({
        where: { userId: user.id, groupId }
      });
      if (currUserGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR) {
        let invUserGroup = await userGroupRepo.findOne({
          where: { userId: invUser.id, groupId }
        });

        if (!invUserGroup
          || ![UserGroupRoleOptions.MEMBER,
            UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(invUserGroup.role)) {
          await userGroupRepo.save({
            userId: invUser.id,
            groupId,
            role: UserGroupRoleOptions.INVITED,
          });
        }
      }

      return await userGroupRepo.findOneOrFail({
        where: { userId: invUser.id, groupId },
        relations: ['user', 'group']
      });
    },

    async acceptGroupInvitation(_: any, {groupId}: any, {user, connection}: any): Promise<UserGroup> {
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({
        where: { userId: user.id, groupId }
      });
      if (userGroup.role === UserGroupRoleOptions.INVITED) {
        await userGroupRepo.save({
          userId: user.id,
          groupId,
          role: UserGroupRoleOptions.MEMBER,
        });
      }

      return await userGroupRepo.findOneOrFail({
        where: { userId: user.id, groupId },
        relations: ['user', 'group']
      });
    },

    async importDatasetsIntoGroup(_: any, {groupId, datasetIds}: any, {user, connection}: any): Promise<Boolean> {
      // await checkAccessRights(connection, user, groupId);

      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const dsRepo = connection.getRepository(DatasetModel);
      for (let id of datasetIds) {
        await dsRepo.save({ id, groupId });
      }
      // TODO: update documents in ES for datasetIds
      return true;
    },
  }
};
