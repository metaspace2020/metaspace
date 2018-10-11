import {UserError} from 'graphql-errors';
import {Connection, Like, In} from 'typeorm';

import {Credentials as CredentialsModel} from '../auth/model';
import {Group as GroupModel, UserGroup as UserGroupModel, UserGroupRoleOptions} from './model';
import {User as UserModel} from '../user/model';
import {Dataset as DatasetModel} from '../dataset/model';
import {Group, UserGroup, UserGroupRole} from '../../binding';
import {Context, Scope, ScopeRole, ScopeRoleOptions} from '../../context';
import {LooselyCompatible, smAPIRequest, logger, findUserByEmail} from '../../utils';
import {JwtUser} from '../auth/controller';
import {sendInvitationEmail} from '../auth';
import config from '../../utils/config';

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

const assertCanCreateGroup = (user: JwtUser) => {
  if (!user || user.role !== 'admin')
    throw new UserError('Only admins can create groups');
};

const assertUserAuthenticated = (user: JwtUser) => {
  if (!user || !user.id)
    throw new UserError('Not authenticated');
};

const assertUserRoles = async (connection: Connection, user: JwtUser, groupId: string, roles: UserGroupRole[]) => {
  if (groupId) {
    if (user.role === 'admin')
      return;

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
      const {principalInvestigatorEmail, ...groupInput} = groupDetails;

      logger.info(`Creating ${groupInput.name} group by ${user}...`);
      assertCanCreateGroup(user);

      // TODO create inactive account for PI
      const insertRes = await connection.getRepository(GroupModel).insert(groupInput);
      const groupIdMap = insertRes.identifiers[0];

      logger.info(`${groupInput.name} group created`);
      return {...groupIdMap, ...groupInput};
    },

    async updateGroup(_: any, {groupId, groupDetails}: any, {user, connection}: any): Promise<Group> {
      logger.info(`Updating '${groupId}' group by ${user}...`);
      await assertCanEditGroup(connection, user, groupId);

      const groupRepo = connection.getRepository(GroupModel);
      let group = await groupRepo.findOneOrFail(groupId);
      group = groupRepo.save({...group, ...groupDetails});  // update doesn't return updated object;

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

    async deleteGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      logger.info(`Deleting '${groupId}' group by ${user}...`);
      await assertCanEditGroup(connection, user, groupId);

      await connection.getRepository(UserGroupModel).delete({groupId});
      await connection.getRepository(GroupModel).delete(groupId);

      logger.info(`'${groupId}' group deleted`);
      return true;
    },

    async leaveGroup(_: any, {groupId}: any, {user, connection}: any): Promise<Boolean> {
      logger.info(`User ${user} leaving '${groupId}' group...`);
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      const userGroup = await userGroupRepo.findOneOrFail({ userId: user.id });
      if (userGroup.role === UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR)
        throw new UserError('Group PI cannot leave group');

      await userGroupRepo.delete({ userId: user.id, groupId });
      logger.info(`User '${user.id}' left '${groupId}' group`);
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

      let invUser = await findUserByEmail(connection, email, 'email')
        || await findUserByEmail(connection, email, 'not_verified_email');
      if (!invUser) {
        // create not verified user
        const invUserCred = await connection.getRepository(CredentialsModel).save({ emailVerified: false });
        invUser = await connection.getRepository(UserModel).save({
          notVerifiedEmail: email,
          credentials: invUserCred
        }) as UserModel;
        const invitedByUser = await findUserByEmail(connection, user.email);
        const link = `${config.web_public_url}/account/create-account`;
        sendInvitationEmail(email, invitedByUser!.name || '', link);
      }
      await connection.getRepository(GroupModel).findOneOrFail(groupId);

      const userGroupRepo = connection.getRepository(UserGroupModel);

      let invUserGroup = await userGroupRepo.findOne({
        where: { userId: invUser.id, groupId }
      });

      if (invUserGroup && [UserGroupRoleOptions.MEMBER,
          UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(invUserGroup.role)) {
          logger.info(`User ${invUserGroup.userId} is already member of ${groupId}`);
      }
      else {
        invUserGroup = await userGroupRepo.save({
          userId: invUser.id,
          groupId,
          role: UserGroupRoleOptions.INVITED,
        });
        logger.info(`${invUserGroup.userId} user was invited to ${groupId} group`);
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
