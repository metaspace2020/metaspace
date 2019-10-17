import {
  doQuery,
  onAfterAll, onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser
} from '../../../tests/graphqlTestEnvironment';
import {createTestProject} from '../../../tests/testDataCreation';
import {
  Project as ProjectModel,
  UserProject as UserProjectModel,
  UserProjectRoleOptions,
} from '../model';
import {PublicationStatusOptions as PSO} from '../PublicationStatusOptions';
import {Project as ProjectType} from '../../../binding';


describe('Project delete/hide not allowed for published ones', () => {
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  const deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`,
    updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
      updateProject(projectId: $projectId, projectDetails: $projectDetails) { id }
    }`;

  it('Not allowed to delete published project', async () => {
    const project = await createTestProject(
      { publicationStatus: PSO.UNDER_REVIEW });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });

    const promise = doQuery<ProjectType>(deleteProject, { projectId: project.id });

    await expect(promise).rejects.toThrow(/Cannot modify project/);
    await testEntityManager.findOneOrFail(ProjectModel, project.id);
  });

  it('Not allowed to make published project private', async () => {
    const project = await createTestProject(
      { publicationStatus: PSO.PUBLISHED });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });

    const promise = doQuery<ProjectType>(updateProject,
      { projectId: project.id, projectDetails: { isPublic: false }});

    await expect(promise).rejects.toThrow(/Cannot modify project/);
    const { isPublic } = await testEntityManager.findOneOrFail(ProjectModel, project.id);
    expect(isPublic).toBe(true);
  });
});
