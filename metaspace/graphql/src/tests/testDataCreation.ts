import * as _ from 'lodash';
import * as moment from 'moment';
import {User} from '../modules/user/model';
import {Credentials} from '../modules/auth/model';
import {testEntityManager, userContext} from './graphqlTestEnvironment';
import {
  Project,
  UserProject as UserProjectModel,
  UserProjectRoleOptions as UPRO,
} from '../modules/project/model';
import {PublicationStatusOptions as PSO} from '../modules/project/PublicationStatusOptions';
import {PublicationStatus, UserGroupRole, UserProjectRole} from '../binding';
import {Dataset, DatasetProject} from '../modules/dataset/model';
import {EngineDataset} from '../modules/engine/model';
import {Group, UserGroup as UserGroupModel} from '../modules/group/model';


export const createTestUser = async (user?: Partial<User>): Promise<User> => {
  const creds = (await testEntityManager.save(Credentials, {})) as any as Credentials;
  return await testEntityManager.save(User, {
    name: 'tester',
    role: 'user',
    credentialsId: creds.id,
    email: `${Math.random()}@example.com`,
    ...user,
  }) as User;
};

export const createTestGroup = async (group?: Partial<Group>): Promise<Group> => {
  const groupDefaultFields = {
    name: 'test group',
    shortName: 'tstgrp',
    isPublic: true,
  };
  return await testEntityManager.save(Group, {...groupDefaultFields, ...group}) as Group;
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
  };
  return await testEntityManager.save(Project, {...projectDefaultFields, ...project}) as Project;
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

export const createTestProjectMember = async (projectOrId: string | {id: string},
                                              role: UserProjectRole = UPRO.MEMBER) => {
  const user = await createTestUser({name: 'project member'}) as User;
  await testEntityManager.save(UserProjectModel, {
    userId: user.id,
    projectId: typeof projectOrId === 'string' ? projectOrId : projectOrId.id,
    role,
  });
  return user;
};

const dbInsert = async (table: string, params: object) => {
  const paramFields = Object.keys(params);
  const paramValues = Object.values(params);
  const paramIndexes = paramFields.map((key, idx) => `$${idx+1}`);
  await testEntityManager.query(
    `INSERT INTO ${table} (${paramFields.join(',')}) VALUES (${paramIndexes.join(',')})`,
    paramValues);
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

  await dbInsert('public.dataset', {
    id: datasetId,
    name: 'test dataset',
    upload_dt: new Date,
    metadata: {},
    status: 'FINISHED',
    is_public: true,
    ...engineDataset,
  });

  return (await datasetPromise) as Dataset;
};

export const createTestDatasetInProject = async (publicationStatus: PublicationStatus) => {
  const dataset = await createTestDataset(),
    project = await createTestProject();
  await testEntityManager.save(DatasetProject, {
    projectId: project.id,
    datasetId: dataset.id,
    approved: true,
    publicationStatus
  });
  return dataset;
};
