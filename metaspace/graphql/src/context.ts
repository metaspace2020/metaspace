import {Request, Response} from 'express';
import {EntityManager} from 'typeorm';
import {ProjectRole} from '../../webapp/src/api/project';

export type UserProjectRoles = {[projectId: string]: ProjectRole | undefined}

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
  entityManager: EntityManager;
  user: ContextUser | null;
  isAdmin: boolean;
  getUserIdOrFail: () => string; // Throws "Unauthenticated" error if not logged in
  getCurrentUserProjectRoles: () => Promise<UserProjectRoles>;
}

