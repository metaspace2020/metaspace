import {Connection, EntityManager} from 'typeorm';
import {JwtUser} from './modules/auth/controller';
import {ProjectRole} from '../../webapp/src/api/project';

export type UserProjectRoles = {[projectId: string]: ProjectRole | undefined}

export interface Context {
  // TODO: Replace connection with just EntityManager and rename it, as EntityManager is almost the same, but
  // it can be swapped out by tests so that everything runs in a transaction.
  connection: Connection | EntityManager;
  user: JwtUser | null;
  isAdmin: Boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  getCurrentUserProjectRoles: () => Promise<UserProjectRoles>;
}

