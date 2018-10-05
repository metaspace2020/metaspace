import {UserError} from 'graphql-errors';
import {Connection, Like, In} from 'typeorm';

import {Group as GroupModel, UserGroup as UserGroupModel, UserGroupRoleOptions} from './model';
import {User as UserModel} from '../user/model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Group, UserGroup, User, UserGroupRole} from '../../binding';
import {Context} from '../../context';
import {Scope, ScopeRole, ScopeRoleOptions} from '../../bindingTypes';
import {LooselyCompatible, smAPIRequest, logger} from '../../utils';
import {JwtUser} from '../auth/controller';

const findUserByEmail = async (connection: Connection, email: string) => {
  return await connection.getRepository(UserModel)
    .createQueryBuilder()
    .where('LOWER(email) = :email', {'email': email.toLowerCase()})
    .getOne();
};

const resolveGroupScopeRole = async (ctx: Context, groupId?: string): Promise<ScopeRole> => {
  let scopeRole = ScopeRoleOptions.OTHER;
  if (ctx.user != null && ctx.user.role === 'admin') {
    scopeRole = ScopeRoleOptions.ADMIN;
  }
  else {
    if (ctx.user != null && groupId) {
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

const assertCanCreateGroup = (user: JwtUser) => {
  if (!user || user.role !== 'admin')
    throw new UserError('Only admins can create groups');
};

const assertUserAuthenticated = (user: JwtUser) => {
  if (!user || !user.id)
    throw new UserError('Not authenticated');
};

const assertUserRoles = async (connection: Connection, user: JwtUser, groupId: string, roles: UserGroupRole[]) => {
  if (groupId && user.role !== 'admin') {
    const userGroup = (await connection.getRepository(UserGroupModel).find({
      select: ['userId'],
      where: {
        userId: user.id,
        groupId,
        role: In(roles),
      }
    }));
    if (!userGroup) {
      throw new UserError('Access denied');
    }
  }
};

const assertCanEditGroup = async (connection: Connection, user: JwtUser, groupId: string) => {
  assertUserAuthenticated(user);
  await assertUserRoles(connection, user, groupId,
    [UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR]);
};

const assertCanAddDataset = async (connection: Connection, user: JwtUser, groupId: string) => {
  assertUserAuthenticated(user);
  await assertUserRoles(connection, user, groupId,
    [UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR, UserGroupRoleOptions.MEMBER]);
};


export const Resolvers = {
  UserGroup: {
    async numDatasets(userGroup: UserGroupModel, _: any, {connection}: any) {
      return await connection.getRepository(DatasetModel).count({
        where: { userId: userGroup.user.id, groupApproved: true }
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
      assertCanCreateGroup(user);

      const {principalInvestigatorEmail, ...groupInput} = groupDetails;
      // TODO create inactive account for PI

      const insertRes = await connection.getRepository(GroupModel).insert(groupInput);
      const groupIdMap = insertRes.identifiers[0];
      return {...groupIdMap, ...groupInput};
    },

    async updateGroup(_: any, {groupId, groupDetails}: any, {user, connection}: any): Promise<Group> {
      await assertCanEditGroup(connection, user, groupId);

      const groupRepo = connection.getRepository(GroupModel);
      let group = await groupRepo.findOneOrFail(groupId);
      group = groupRepo.save({...group, ...groupDetails});  // update doesn't return updated object;

      const groupDSs = await connection.getRepository(DatasetModel).find({ groupId });
      if (groupDSs) {
        for (let ds of groupDSs) {
          await smAPIRequest(`/v1/datasets/${ds.id}/update`, {
            doc: { groupId }
          });
        }
      }
      return group;
    },

    async deleteGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      await assertCanEditGroup(connection, user, groupId);

      await connection.getRepository(UserGroupModel).delete({groupId});
      await connection.getRepository(GroupModel).delete(groupId);
      return true;
    },

    async leaveGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({ userId: user.id });
      if (userGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR)
        throw new UserError('Group PI cannot leave group');

      await userGroupRepo.delete({ userId: user.id, groupId });
      return true;
    },

    async removeUserFromGroup(_: any, {groupId, userId}: any, {user, connection}: any): Promise<Boolean> {
      await assertCanEditGroup(connection, user, groupId);

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
      await assertCanEditGroup(connection, user, groupId);

      await connection.getRepository(UserModel).findOneOrFail(userId);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const reqUserGroup = await userGroupRepo.findOne({ userId, groupId });
      if (!reqUserGroup)
        throw new UserError(`User '${userId}' did not request to join '${groupId}' group`);

      if (reqUserGroup.role == UserGroupRoleOptions.PENDING) {
        await userGroupRepo.save({
          userId,
          groupId,
          role: UserGroupRoleOptions.MEMBER
        });
      }

      return userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group']
      }) as UserGroup;
    },

    async inviteUserToGroup(_: any, {groupId, email}: any, {user, connection}: any): Promise<UserGroup> {
      await assertCanEditGroup(connection, user, groupId);

      const invUser = await findUserByEmail(connection, email);
      if (!invUser)
        // TODO: send sign up invitation
        throw new UserError('Not Implemented Yet');
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      let invUserGroup = await userGroupRepo.findOne({
        where: { userId: invUser.id, groupId }
      });

      if (invUserGroup && [UserGroupRoleOptions.MEMBER,
          UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(invUserGroup.role)) {
          logger.info(`User ${invUserGroup.userId} is already member of ${groupId}`)
      }
      else {
        await userGroupRepo.save({
          userId: invUser.id,
          groupId,
          role: UserGroupRoleOptions.INVITED,
        });
        logger.info(`Invited ${invUserGroup.userId} user to ${groupId} group`)
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
      await assertCanAddDataset(connection, user, groupId);

      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const dsRepo = connection.getRepository(DatasetModel);
      for (let dsId of datasetIds) {
        await dsRepo.update(dsId, { groupId, groupApproved: true });
        await smAPIRequest(`/v1/datasets/${dsId}/update`, {
          doc: { groupId: groupId }
        });
      }
      return true;
    },
  }
};
