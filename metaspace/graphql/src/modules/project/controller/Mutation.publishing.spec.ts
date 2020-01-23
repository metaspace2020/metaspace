import {
  doQuery,
  onAfterAll, onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser
} from '../../../tests/graphqlTestEnvironment';
import {createTestDataset, createTestProject} from '../../../tests/testDataCreation';
import {
  Project as ProjectModel,
  UserProject as UserProjectModel,
  UserProjectRoleOptions,
} from '../model';
import {PublicationStatusOptions as PSO} from '../PublicationStatusOptions';
import {Project as ProjectType} from '../../../binding';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';


describe('Project publication status manipulations', () => {
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  const createReviewLink = `mutation ($projectId: ID!) {
      createReviewLink(projectId: $projectId) { id isPublic reviewToken publicationStatus }
    }`,
    publishProject = `mutation ($projectId: ID!) {
      publishProject(projectId: $projectId) { id publicationStatus }
    }`,
    deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`,
    updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
      updateProject(projectId: $projectId, projectDetails: $projectDetails) { id }
    }`;

  test('Create review link changes publication status', async () => {
    const project = await createTestProject({ isPublic: false, publicationStatus: PSO.UNPUBLISHED });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });
    const dataset = await createTestDataset();
    await testEntityManager.insert(DatasetProjectModel,
      { datasetId: dataset.id, projectId: project.id, approved: true });

    const result = await doQuery<ProjectType>(createReviewLink, { projectId: project.id });

    expect(result).toEqual(expect.objectContaining(
      { isPublic: false, reviewToken: expect.anything(), publicationStatus: PSO.UNDER_REVIEW }));
    const datasetProject = await testEntityManager.findOne(DatasetProjectModel,
      { projectId: project.id, publicationStatus: PSO.UNDER_REVIEW });
    expect(datasetProject).toBeDefined();
  });

  test('Project publish changes publication status and visibility', async () => {
    const project = await createTestProject({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });
    const dataset = await createTestDataset();
    await testEntityManager.insert(DatasetProjectModel,
      { datasetId: dataset.id, projectId: project.id, approved: true });

    const result = await doQuery<ProjectType>(publishProject, { projectId: project.id });

    expect(result.publicationStatus).toBe(PSO.PUBLISHED);
    const datasetProject = await testEntityManager.findOne(DatasetProjectModel,
      { projectId: project.id, publicationStatus: PSO.PUBLISHED });
    expect(datasetProject).toBeDefined();
  });

  test('Not allowed to delete published project', async () => {
    const project = await createTestProject({ publicationStatus: PSO.UNDER_REVIEW });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });

    const promise = doQuery<ProjectType>(deleteProject, { projectId: project.id });

    await expect(promise).rejects.toThrow(/Cannot modify project/);
    await testEntityManager.findOneOrFail(ProjectModel, project.id);
  });

  test('Not allowed to make published project private', async () => {
    const project = await createTestProject({ publicationStatus: PSO.PUBLISHED });
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER });

    const promise = doQuery<ProjectType>(updateProject,
      { projectId: project.id, projectDetails: { isPublic: false }});

    await expect(promise).rejects.toThrow(/Cannot modify project/);
    const { isPublic } = await testEntityManager.findOneOrFail(ProjectModel, project.id);
    expect(isPublic).toBe(true);
  });
});
