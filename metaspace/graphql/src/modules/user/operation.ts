import {User as UserModel, Dataset} from './model';
import {Repository, Like} from 'typeorm';
import {UpdateUserInput} from '../../binding';
import {UserError} from 'graphql-errors';

function hasAccess(user: UserModel, userId?: string) {
  if (!user
    || (user.role !== 'admin' && (userId && user.id !== userId)))
    throw new UserError('Access denied');
}

export const generateUserOperations = (user: UserModel,
                                       userRepo: Repository<UserModel>,
                                       dsRepo: Repository<Dataset>) => ({
  findUserById: async (userId: string) => {
    hasAccess(user, userId);

    if (userId) {
      const userObj = await userRepo.findOne({
        relations: ['credentials'],
        where: { 'id': userId }
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
  },

  findUsers: async (query: string='') => {
    hasAccess(user);

    return await userRepo.find({
      where: {
        'name': Like(`%${query}%`)
      }
    });
  },

  updateUser: async (userId: string, update: UpdateUserInput) => {
    hasAccess(user, userId);

    if (update.role && user.role !== 'admin') {
      throw new UserError('Only admin can update role');
    }

    if (update.email) {
      // TODO: confirm new email
      throw new UserError('Not implemented yet');
    }

    let userObj = await userRepo.findOne(userId);
    if (userObj) {
      userObj = Object.assign(userObj, update);
      await userRepo.save(userObj);  // update by id doesn't work properly
    }
    return userObj;
  },

  deleteUser: async (userId: string, deleteDatasets: boolean=false) => {
    hasAccess(user, userId);

    if (deleteDatasets) {
      throw new UserError('Not implemented yet');
    }

    let userObj = await userRepo.findOne(userId);
    if (!userObj) {
      throw new UserError('User does not exist');
    }
    await userRepo.delete(userId);
    // TODO: delete credentials
    return true;
  },

  addUserDataset: async (userId: string, dsId: string) => {
    hasAccess(user, userId);

    const ds = dsRepo.create({
      id: dsId,
      user: await userRepo.findOne(userId)
    });
    await dsRepo.insert(ds);
  }
});
