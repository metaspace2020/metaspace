import {Context, UserProjectRoles} from '../../../context';
import {Brackets} from 'typeorm';

// Returns a where clause that accepts only projects that should be visible to the current user
export const projectIsVisibleToCurrentUserWhereClause = (ctx: Context, userProjectRoles: UserProjectRoles) => {
  if (ctx.isAdmin) {
    return new Brackets(qb => qb.where('True'));
  } else if (ctx.user != null && ctx.user.id != null) {
    const projectIds = Object.keys(userProjectRoles);
    return new Brackets(qb => qb.where('project.isPublic = True')
      .orWhere('project.id = ANY(:projectIds)', { projectIds }));
  } else {
    return new Brackets(qb => qb.where('project.isPublic = True'));
  }
};
