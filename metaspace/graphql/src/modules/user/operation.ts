import {User as UserModel} from './model';
import {Repository, Like} from 'typeorm';
import {UpdateUserInput} from '../../binding';
import {UserError} from 'graphql-errors';

export const generateUserOperations = (user: UserModel, userRepo: Repository<UserModel>) => ({

  findUserById: async (id: string) => {
    if (user && (user.role === 'admin' || user.id === id)) {
      if (id) {
        const userObj = await userRepo.findOne({
          relations: ['credentials'],
          where: { 'id': id }
        });

        if (userObj) {
          return {
            id: userObj.id,
            name: userObj.name,
            role: userObj.role,
            email: userObj.email
          }
        }
      }
    }
    else {
      throw new UserError('Access denied');
    }
  },

  findUsers: async (query: string='') => {
    if (user && user.role === 'admin') {
      return await userRepo.find({
        where: {
          name: Like(`%${query}%`)
        }
      });
    }
    else {
      throw new UserError('Access denied');
    }
  },

  updateUser: async (id: string, update: UpdateUserInput) => {
    if (user && (user.role === 'admin' || user.id === id)) {

      if (update.role && user.role !== 'admin') {
        throw new UserError('Only admin can update role');
      }

      if (update.email) {
        // TODO: confirm new email
        throw new UserError('Not implemented yet');
      }

      let userObj = await userRepo.findOne(id);
      if (userObj) {
        userObj = Object.assign(userObj, update);
        await userRepo.save(userObj);
      }
      return userObj;
    }
    else {
      throw new UserError('Access denied');
    }
  },

  deleteUser: async (id: string, deleteDatasets: boolean=false) => {
    if (user && (user.role === 'admin' || user.id === id)) {

      if (deleteDatasets) {
        throw new UserError('Not implemented yet');
      }

      let userObj = await userRepo.findOne(id);
      if (!userObj) {
        throw new UserError('User does not exist');
      }
      await userRepo.delete(id);
      // TODO: delete credentials
      return true;
    }
    else {
      throw new UserError('Access denied');
    }
  },
});
