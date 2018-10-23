import {Project as ProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {Context, UserProjectRoles} from '../../../context';
import {ProjectSource, ScopeRole, ScopeRoleOptions as SRO} from '../../../bindingTypes';

export default (project: ProjectModel, ctx: Context, userProjectRoles: UserProjectRoles): ProjectSource => {
  const currentUserRole = userProjectRoles[project.id] || null;
  let scopeRole: ScopeRole | null;
  if (ctx.isAdmin) {
    scopeRole = SRO.ADMIN;
  } else if (currentUserRole === UPRO.MEMBER) {
    scopeRole = SRO.PROJECT_MEMBER;
  } else if (currentUserRole === UPRO.MANAGER) {
    scopeRole = SRO.PROJECT_MANAGER;
  } else {
    scopeRole = SRO.OTHER;
  }
  return { ...project, currentUserRole, scopeRole };
};
