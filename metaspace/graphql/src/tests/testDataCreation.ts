import * as _ from 'lodash';
import * as moment from 'moment';
import {User} from '../modules/user/model';
import {Credentials} from '../modules/auth/model';
import {testEntityManager, userContext} from './graphqlTestEnvironment';
import {Project, UserProject, UserProjectRoleOptions as UPRO} from '../modules/project/model';
import {UserProjectRole} from '../binding';
import {Dataset} from '../modules/dataset/model';
import {EngineDataset} from '../modules/engine/model';


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

export const createTestProject = async (project?: Partial<Project>): Promise<Project> => {
  return await testEntityManager.save(Project, {
    name: 'test project',
    isPublic: true,
    ...project,
  }) as Project;
};

export const createTestProjectMember = async (projectOrId: string | {id: string},
                                              role: UserProjectRole = UPRO.MEMBER) => {
  const user = await createTestUser({name: 'project member'}) as User;
  await testEntityManager.save(UserProject, {
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

