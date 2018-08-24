import {User} from '../../binding';

export const Resolvers = {
  Query: {
    async user(_: any, {userId}: any, {UserOperations}: any): Promise<User|undefined> {
      return await UserOperations.findUserById(userId);
    },
    async currentUser(_: any, {}: any, {UserOperations, user}: any): Promise<User|undefined> {
      if (user) {
        return await UserOperations.findUserById(user.id);
      }
    },
    async allUsers(_: any, {query}: any, {UserOperations}: any): Promise<User[]|undefined> {
      return UserOperations.findUsers(query);
    }
  },
  Mutation: {
    async updateUser(_: any, {userId, update}: any, {UserOperations}: any): Promise<User|undefined> {
      await UserOperations.updateUser(userId, update);
      return await UserOperations.findUserById(userId);
    },
    async deleteUser(_: any, {userId}: any, {UserOperations}: any): Promise<Boolean|undefined> {
      return await UserOperations.deleteUser(userId, false);
    }
  }
};
