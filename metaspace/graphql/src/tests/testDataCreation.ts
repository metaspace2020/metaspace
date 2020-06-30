import * as moment from 'moment';
import { User } from '../modules/user/model';
import { Credentials } from '../modules/auth/model';
import { testEntityManager, userContext } from './graphqlTestEnvironment';
import {
  Project,
  UserProject as UserProjectModel,
  UserProjectRoleOptions as UPRO,
} from '../modules/project/model';
import { PublicationStatusOptions as PSO } from '../modules/project/Publishing';
import { PublicationStatus, UserGroupRole, UserProjectRole } from '../binding';
import { Dataset, DatasetProject } from '../modules/dataset/model';
import { EngineDataset } from '../modules/engine/model';
import { Group, UserGroup as UserGroupModel } from '../modules/group/model';
import {MolecularDB} from "../modules/moldb/model";

export const createTestUser = async (user?: Partial<User>): Promise<User> => {
  return (await createTestUserWithCredentials(user))[0]
};

export const createTestUserWithCredentials = async (user?: Partial<User>): Promise<[User, Credentials]> => {
  const creds = (await testEntityManager.save(Credentials, {}, {})) as Credentials;
  const userModel = await testEntityManager.save(User, {
    name: 'tester',
    role: 'user',
    credentialsId: creds.id,
    email: `${Math.random()}@example.com`,
    ...user,
  }) as User;
  return [userModel, creds];
};

export const createTestGroup = async (group?: Partial<Group>): Promise<Group> => {
  const groupDefaultFields = {
    name: 'test group',
    shortName: 'tstgrp',
    isPublic: true,
  };
  return await testEntityManager.save(Group, { ...groupDefaultFields, ...group }) as Group;
};

export const createTestUserGroup = async (userId: string, groupId: string, role: UserGroupRole | null,
  primary: boolean): Promise<UserGroupModel | null> => {
  if (role != null) {
    return await testEntityManager.save(UserGroupModel, { userId, groupId, role, primary }) as UserGroupModel;
  } else {
    await testEntityManager.delete(UserGroupModel, { userId, groupId });
    return null;
  }
};

export const createTestProject = async (project?: Partial<Project>): Promise<Project> => {
  const projectDefaultFields = {
    name: 'test project',
    isPublic: true,
    publicationStatus: PSO.UNPUBLISHED,
    // WORKAROUND: Jest considers moment instances different if they're created from a Date vs created by moment.utc()
    // due to the presence/absense of an internal `_i` property.
    // Create from a Date() instance here so that validateBackgroundData doesn't see an invisible difference between
    // the `createTestProject` return value and the retrieved results from the database.
    createdDT: moment.utc(moment.utc().toDate()),
  };
  return await testEntityManager.save(Project, { ...projectDefaultFields, ...project }) as Project;
};

export const createTestUserProject = async (userId: string, projectId: string,
  role: UserProjectRole | null): Promise<UserProjectModel | null> => {
  if (role != null) {
    return await testEntityManager.save(UserProjectModel, { userId, projectId, role }) as UserProjectModel;
  } else {
    await testEntityManager.delete(UserProjectModel, { userId, projectId });
    return null;
  }
};

export const createTestProjectMember = async (projectOrId: string | { id: string },
  role: UserProjectRole = UPRO.MEMBER) => {
  const user = await createTestUser({ name: 'project member' }) as User;
  await testEntityManager.save(UserProjectModel, {
    userId: user.id,
    projectId: typeof projectOrId === 'string' ? projectOrId : projectOrId.id,
    role,
  });
  return user;
};

const genDatasetId = () => {
  const randomUnixTime = 150e10 + Math.floor(Math.random() * 10e10);
  return moment(randomUnixTime).toISOString()
    .replace(/([\d\-]+)T(\d+):(\d+):(\d+).*/, '$1_$2h$3m$4s');
};

export const createTestDataset = async (dataset: Partial<Dataset> = {}, engineDataset: Partial<EngineDataset> = {}): Promise<Dataset> => {
  const datasetId = engineDataset.id || genDatasetId();
  const datasetPromise = testEntityManager.save(Dataset, {
    id: datasetId,
    userId: userContext.getUserIdOrFail(),
    ...dataset,
  });

  await testEntityManager.save(EngineDataset, {
    id: datasetId,
    name: 'test dataset',
    uploadDt: moment.utc(),
    statusUpdateDt: moment.utc(),
    metadata: {},
    status: 'FINISHED',
    isPublic: true,
    ...engineDataset,
  });

  return (await datasetPromise) as Dataset;
};

export const createTestDatasetProject = async (publicationStatus: PublicationStatus): Promise<DatasetProject> => {
  const dataset = await createTestDataset(),
    project = await createTestProject({ publicationStatus });
  const datasetProjectPromise = testEntityManager.save(DatasetProject, {
    projectId: project.id,
    datasetId: dataset.id,
    approved: true
  } as Partial<DatasetProject>);
  return (await datasetProjectPromise) as DatasetProject;
};

export const createTestMolecularDB = async (molecularDb: Partial<MolecularDB> = {}): Promise<MolecularDB> => {
  return await testEntityManager.save(MolecularDB, {
    name: 'test-db',
    version: 'db-version',
    isPublic: false,
    archived: false,
    fullName: 'Full database name',
    description: 'Database description',
    link: 'http://example.org',
    citation: 'citation string',
    ...molecularDb
  }) as MolecularDB;
};
