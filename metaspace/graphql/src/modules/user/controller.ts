import {UserError} from "graphql-errors";
import {Like} from 'typeorm';

import {UpdateUserInput, User} from '../../binding';
import {User as UserModel, Dataset as DatasetModel} from './model';
import {Credentials as CredentialsModel} from '../auth/model';
import {UserGroup as UserGroupModel, Group as GroupModel} from '../group/model';

const hasAccess = (user: UserModel, userId?: string) => {
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

export const addUserDataset = async ({userId, dsId}: any, {user, connection}: any) => {
  hasAccess(user, userId);

  return connection.getRepository(DatasetModel).insert({
    id: dsId,
    userId: userId
  });
};

export const Resolvers = {
  User: {
    async primaryGroup(user: UserModel, _: any, {connection}: any): Promise<UserGroupModel|null> {
      return await connection.getRepository(UserGroupModel).findOne({
        where: { userId: user.id, primary: true },
        relations: ['group']
      }) || null;
    },

    async groups(user: UserModel, _: any, {connection}: any): Promise<UserGroupModel[]> {
      return await connection.getRepository(UserGroupModel).find({
        where: { userId: user.id },
        relations: ['group']
      });
    }
  },

  Query: {
    async user(_: any, {userId}: any, {user, connection}: any): Promise<User|null> {
      await hasAccess(user, userId);

      if (userId) {
        return await connection.getRepository(UserModel).findOneOrFail({
          where: { 'id': userId }
        });
      }
      return null;
    },

    async currentUser(_: any, {}: any, {user, connection}: any): Promise<User|null> {
      if (user) {
        return await connection.getRepository(UserModel).findOneOrFail({
          where: { 'id': user.id }
        });
      }
      return null;
    },

    async allUsers(_: any, {query}: any, {user, connection}: any): Promise<User[]> {
      hasAccess(user);

      return await connection.getRepository(UserModel).find({
        where: { name: Like(`%${query}%`) }
      });
    }
  },

  Mutation: {
    async updateUser(_: any, {userId, update}: any, {user, connection}: any): Promise<User> {
      hasAccess(user, userId);

      if (update.role && user.role !== 'admin') {
        throw new UserError('Only admin can update role');
      }

      if (update.email || update.primaryGroupId) {
        // TODO: confirm new email
        throw new UserError('Not implemented yet');
      }

      let userObj = await connection.getRepository(UserModel).findOneOrFail({
        where: { 'id': userId }
      });
      userObj = await connection.getRepository(UserModel).save({...userObj, ...update});
      return userObj;
    },

    async deleteUser(_: any, {userId, deleteDatasets}: any, {user, connection}: any): Promise<Boolean> {
      hasAccess(user, userId);

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
