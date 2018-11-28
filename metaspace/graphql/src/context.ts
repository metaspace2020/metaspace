import {Request, Response} from 'express';
import {Connection, EntityManager} from 'typeorm';
import {UserProjectRole} from './binding';

export type UserProjectRoles = {[projectId: string]: UserProjectRole | undefined}

export interface ContextUser {
  role: 'user' | 'admin';
  id: string,
  email?: string,
  groupIds?: string[], // used in esConnector for ES visibility filters
  getProjectRoles: () => Promise<UserProjectRoles>;
  getMemberOfProjectIds: () => Promise<string[]>;
}

export interface Context {
  req: Request;
  res: Response;
  // TODO: Replace connection with just EntityManager and rename it, as EntityManager is almost the same, but
  // it can be swapped out by tests so that everything runs in a transaction.
  connection: Connection | EntityManager;
  user: ContextUser | null;
  isAdmin: boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  getCurrentUserProjectRoles: () => Promise<UserProjectRoles>;
}

