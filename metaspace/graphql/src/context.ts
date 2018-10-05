import {Connection} from 'typeorm';
import {JwtUser} from './modules/auth/controller';
import {ProjectRole} from '../../webapp/src/api/project';

export type UserProjectRoles = {[projectId: string]: ProjectRole | undefined}

export interface Context {
  connection: Connection;
  user: JwtUser | null;
  isAdmin: Boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  getCurrentUserProjectRoles: () => Promise<UserProjectRoles>;
}

