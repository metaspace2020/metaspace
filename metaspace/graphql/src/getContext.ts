import {Connection} from 'typeorm';
import {Context, UserProjectRoles} from './context';
import {UserProject as UserProjectModel} from './modules/project/model';
import _ = require('lodash');
import {UserError} from 'graphql-errors';

export default (req: Express.Request, connection: Connection): Context => {
  const user = req.user != null ? req.user.user : null;
  let currentUserProjectRoles: Promise<UserProjectRoles> | null = null;

  return {
    connection,
    user,
    isAdmin: user && user.role === 'admin',
    getUserIdOrFail() {
      if (user == null || user.id == null) {
        throw new UserError('Unauthenticated');
      }
      return user.id;
    },
    getCurrentUserProjectRoles() {
      if (currentUserProjectRoles == null && user != null && user.id != null) {
        currentUserProjectRoles = new Promise<UserProjectRoles>(async (resolve, reject) => {
          try {
            const userProjects = await connection.getRepository(UserProjectModel)
              .find({ where: { userId: user.id } });
            resolve(_.fromPairs(userProjects.map(up => [up.projectId, up.role])));
          } catch (err) {
            reject(err);
          }
        });
      } else if (currentUserProjectRoles == null) {
        currentUserProjectRoles = Promise.resolve({});
      }

      return currentUserProjectRoles;
    },
  };
}
