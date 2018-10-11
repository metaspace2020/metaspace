import {Connection} from 'typeorm';
import {JwtUser} from './modules/auth/controller';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from './modules/group/model';

export type ScopeRole = 'PROFILE_OWNER' | 'GROUP_MEMBER' | 'GROUP_MANAGER' | 'OTHER' | 'ADMIN';

export const ScopeRoleOptions: Record<ScopeRole, ScopeRole> = {
  PROFILE_OWNER: 'PROFILE_OWNER',
  GROUP_MEMBER: 'GROUP_MEMBER',
  GROUP_MANAGER: 'GROUP_MANAGER',
  OTHER: 'OTHER',
  ADMIN: 'ADMIN',
};

export interface Context {
  connection: Connection,
  user: JwtUser
}

export interface Scope {
  scopeRole: ScopeRole
}
