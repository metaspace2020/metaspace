import {Connection, EntityManager} from 'typeorm';
import {Context, UserProjectRoles} from './context';
import {UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from './modules/project/model';
import _ = require('lodash');
import {UserError} from 'graphql-errors';

export default (req: Express.Request, connection: Connection | EntityManager): Context => {
  const user = req.user != null ? req.user.user : null;

  let currentUserProjectRoles: Promise<UserProjectRoles> | null = null;
  const getProjectRoles = async () => {
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

    return await currentUserProjectRoles;
  };

  const getMemberOfProjectIds = async () => {
    const projectRoles = await getProjectRoles();
    return Object.entries(projectRoles)
      .filter(([id, role]) => role != null && [UPRO.MEMBER, UPRO.MANAGER].includes(role))
      .map(([id, role]) => id);
  };


  return {
    connection,
    user: user == null || user.id == null ? null : {
      id: user.id,
      role: user.role,
      email: user.email,
      groupIds: user.groupIds,
      getProjectRoles,
      getMemberOfProjectIds,
    },
    isAdmin: user && user.role === 'admin',
    getUserIdOrFail() {
      if (user == null || user.id == null) {
        throw new UserError('Unauthenticated');
      }
      return user.id;
    },
    getCurrentUserProjectRoles: getProjectRoles,
  };
}
