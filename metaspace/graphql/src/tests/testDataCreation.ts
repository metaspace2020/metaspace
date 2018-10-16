import {User} from '../modules/user/model';
import {Credentials} from '../modules/auth/model';
import {testEntityManager} from './graphqlTestEnvironment';
import {Project, UserProject, UserProjectRoleOptions as UPRO} from '../modules/project/model';
import {UserProjectRole} from '../binding';


export const createTestUser = async (user?: Partial<User>) => {
  const creds = (await testEntityManager.save(Credentials, {})) as any as Credentials;
  return await testEntityManager.save(User, {
    name: 'tester',
    role: 'user',
    credentialsId: creds.id,
    email: `${Math.random()}@example.com`,
    ...user,
  }) as User;
};

export const createTestProject = async (project?: Partial<Project>) => {
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
