import {UserError} from 'graphql-errors';
import {Connection, Like, In, EntityManager} from 'typeorm';

import {Credentials as CredentialsModel} from '../auth/model';
import {Group as GroupModel, UserGroup as UserGroupModel, UserGroupRoleOptions} from './model';
import {User as UserModel} from '../user/model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Group, UserGroup, User, UserGroupRole} from '../../binding';
import {Context, ContextUser} from '../../context';
import {Scope, ScopeRole, ScopeRoleOptions} from '../../bindingTypes';
import {LooselyCompatible, smAPIRequest, logger, findUserByEmail} from '../../utils';
import {JwtUser} from '../auth/controller';
import {sendInvitationEmail} from '../auth';
import config from '../../utils/config';
import {createInactiveUser} from '../auth/operation';

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
        else if (userGroup.role == UserGroupRoleOptions.GROUP_ADMIN) {
          scopeRole = ScopeRoleOptions.GROUP_MANAGER;
        }
      }
    }
  }
  return scopeRole;
};

const assertCanCreateGroup = (user: ContextUser | null) => {
  if (!user || user.role !== 'admin')
    throw new UserError('Only admins can create groups');
};

const assertUserAuthenticated = (user: ContextUser | null) => {
  if (!user || !user.id)
    throw new UserError('Not authenticated');
};

const assertUserRoles = async (connection: Connection | EntityManager, user: ContextUser | null, groupId: string, roles: UserGroupRole[]) => {
  if (groupId) {
    if (user != null && user.role === 'admin')
      return;

    const userGroup = user != null
      ? (await connection.getRepository(UserGroupModel).find({
        select: ['userId'],
        where: {
          userId: user.id,
          groupId,
          role: In(roles),
        }
      }))
      : null;
    if (!userGroup) {
      throw new UserError('Access denied');
    }
  }
};

const assertCanEditGroup = async (connection: Connection | EntityManager, user: ContextUser | null, groupId: string) => {
  assertUserAuthenticated(user);
  await assertUserRoles(connection, user, groupId,
    [UserGroupRoleOptions.GROUP_ADMIN]);
};

const assertCanAddDataset = async (connection: Connection | EntityManager, user: ContextUser | null, groupId: string) => {
  assertUserAuthenticated(user);
  await assertUserRoles(connection, user, groupId,
    [UserGroupRoleOptions.GROUP_ADMIN, UserGroupRoleOptions.MEMBER]);
};


export const Resolvers = {
  UserGroup: {
    async numDatasets(userGroup: UserGroupModel, _: any, {connection}: Context) {
      return await connection.getRepository(DatasetModel).count({
        where: { userId: userGroup.user.id, groupApproved: true }
      });
    }
  },

  Group: {
    async currentUserRole(group: GroupModel, _: any, {user, connection}: Context) {
      if (user == null) {
        return null;
      }
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
    async createGroup(_: any, {groupDetails}: any, {user, connection}: Context): Promise<LooselyCompatible<Group & Scope>> {
      const {groupAdminEmail, ...groupInput} = groupDetails;
      assertCanCreateGroup(user);
      logger.info(`Creating ${groupInput.name} group by '${user!.id}' user...`);

      const group = await connection.getRepository(GroupModel).save(groupInput) as GroupModel;

      const adminUser = await findUserByEmail(connection, groupAdminEmail)
        || await findUserByEmail(connection, groupAdminEmail, 'not_verified_email')
        || await createInactiveUser(groupAdminEmail);

      await connection.getRepository(UserGroupModel).save({
        groupId: group.id,
        userId: adminUser.id,
        role: UserGroupRoleOptions.GROUP_ADMIN
      });

      logger.info(`${groupInput.name} group created`);
      return group;
    },

    async updateGroup(_: any, {groupId, groupDetails}: any, {user, connection}: Context): Promise<Group> {
      await assertCanEditGroup(connection, user, groupId);
      logger.info(`Updating '${groupId}' group by '${user!.id}' user...`);

      const groupRepo = connection.getRepository(GroupModel);
      const group = {...(await groupRepo.findOneOrFail(groupId)), ...groupDetails};
      await groupRepo.save(group);  // update doesn't return updated object;

      const groupDSs = await connection.getRepository(DatasetModel).find({ groupId });
      if (groupDSs) {
        for (let ds of groupDSs) {
          logger.info(`Updating '${groupId}' group datasets...`);
          await smAPIRequest(`/v1/datasets/${ds.id}/update`, {
            doc: { groupId }
          });
        }
      }
      logger.info(`'${groupId}' group updated`);
      return group;
    },

    async deleteGroup(_: any, {groupId}: any, {user, connection}: Context): Promise<Boolean> {
      await assertCanEditGroup(connection, user, groupId);
      logger.info(`Deleting '${groupId}' group by '${user!.id}' user...`);

      await connection.getRepository(UserGroupModel).delete({groupId});
      await connection.getRepository(GroupModel).delete(groupId);

      logger.info(`'${groupId}' group deleted`);
      return true;
    },

    async leaveGroup(_: any, {groupId}: any, {getUserIdOrFail, connection}: Context): Promise<Boolean> {
      const userId = getUserIdOrFail();
      logger.info(`'${userId}' user leaving '${groupId}' group...`);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({ userId });
      if (userGroup.role === UserGroupRoleOptions.GROUP_ADMIN)
        throw new UserError('Group admin cannot leave group');

      await userGroupRepo.delete({ userId, groupId });
      logger.info(`User '${userId}' left '${groupId}' group`);
      return true;
    },

    async removeUserFromGroup(_: any, {groupId, userId}: any, {user, connection}: Context): Promise<Boolean> {
      await assertCanEditGroup(connection, user, groupId);
      logger.info(`User '${user!.id}' removing '${userId}' user from '${groupId}' group...`);

      await connection.getRepository(GroupModel).findOneOrFail(groupId);
      await connection.getRepository(UserModel).findOneOrFail(userId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const currUserGroup = await userGroupRepo.findOneOrFail({ userId: user!.id, groupId });
      if (currUserGroup.role === UserGroupRoleOptions.GROUP_ADMIN) {
        if (userId === user!.id)
          throw new UserError('Group admin cannot remove itself from group');

        await userGroupRepo.delete({ userId, groupId });
      }
      logger.info(`User '${userId}' was removed from '${groupId}' group`);
      return true;
    },

    async requestAccessToGroup(_: any, {groupId}: any, {getUserIdOrFail, connection}: Context): Promise<UserGroupModel> {
      const userId = getUserIdOrFail();
      logger.info(`User '${userId}' requesting access to '${groupId}' group...`);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);
      let userGroup = await userGroupRepo.findOne({ where: { groupId, userId } });

      if (!userGroup) {
        userGroup = userGroupRepo.create({
          userId,
          groupId,
          role: UserGroupRoleOptions.PENDING,
          primary: true
        });
        await userGroupRepo.save(userGroup);
      }

      logger.info(`User '${userId}' requested access to '${groupId}' group`);
      return await userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group']
      });
    },

    async acceptRequestToJoinGroup(_: any, {groupId, userId}: any, {user, connection}: Context): Promise<UserGroupModel> {
      await assertCanEditGroup(connection, user, groupId);
      logger.info(`User '${user!.id}' accepting request from '${userId}' user to join '${groupId}' group...`);

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

      logger.info(`User '${userId}' was accepted to '${groupId}' group`);
      return userGroupRepo.findOneOrFail({
        where: { groupId, userId },
        relations: ['user', 'group']
      });
    },

    async inviteUserToGroup(_: any, {groupId, email}: any, {user, getUserIdOrFail, connection}: Context): Promise<UserGroupModel> {
      await assertCanEditGroup(connection, user, groupId);
      logger.info(`User '${user!.id}' inviting ${email} to join '${groupId}' group...`);

      let invUser = await findUserByEmail(connection, email, 'email')
        || await findUserByEmail(connection, email, 'not_verified_email');
      if (!invUser) {
        invUser = await createInactiveUser(email);
        const currentUser = await connection.getRepository(UserModel).findOneOrFail(getUserIdOrFail());
        const link = `${config.web_public_url}/account/create-account`;
        sendInvitationEmail(email, currentUser.name || '', link);
      }
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      let invUserGroup = await userGroupRepo.findOne({
        where: { userId: invUser.id, groupId }
      });

      if (invUserGroup && [UserGroupRoleOptions.MEMBER,
          UserGroupRoleOptions.GROUP_ADMIN].includes(invUserGroup.role)) {
          logger.info(`User '${invUserGroup.userId}' is already member of '${groupId}'`);
      }
      else {
        invUserGroup = await userGroupRepo.save({
          userId: invUser.id,
          groupId,
          role: UserGroupRoleOptions.INVITED,
        }) as UserGroupModel;
        logger.info(`'${invUserGroup.userId}' user was invited to '${groupId}' group`);
      }

      logger.info(`User ${email} was invited to '${groupId}' group`);
      return await userGroupRepo.findOneOrFail({
        where: { userId: invUser.id, groupId },
        relations: ['user', 'group']
      });
    },

    async acceptGroupInvitation(_: any, {groupId}: any, {getUserIdOrFail, connection}: Context): Promise<UserGroupModel> {
      const userId = getUserIdOrFail();
      logger.info(`User '${userId}' accepting invitation to join '${groupId}' group...`);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({
        where: { userId: userId, groupId }
      });
      if (userGroup.role === UserGroupRoleOptions.INVITED) {
        await userGroupRepo.save({
          userId: userId,
          groupId,
          role: UserGroupRoleOptions.MEMBER,
        });
      }

      logger.info(`User '${userId}' accepted invitation to '${groupId}' group`);
      return await userGroupRepo.findOneOrFail({
        where: { userId: userId, groupId },
        relations: ['user', 'group']
      });
    },

    async importDatasetsIntoGroup(_: any, {groupId, datasetIds}: any, {user, connection}: Context): Promise<Boolean> {
      await assertCanAddDataset(connection, user, groupId);
      logger.info(`User '${user!.id}' importing datasets ${datasetIds} to '${groupId}' group...`);

      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const dsRepo = connection.getRepository(DatasetModel);
      for (let dsId of datasetIds) {
        await dsRepo.update(dsId, { groupId, groupApproved: true });
        await smAPIRequest(`/v1/datasets/${dsId}/update`, {
          doc: { groupId: groupId }
        });
      }
      logger.info(`User '${user!.id}' imported datasets to '${groupId}' group`);
      return true;
    },
  }
};
