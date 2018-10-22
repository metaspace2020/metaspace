import {createTestDataset, createTestProject, createTestProjectMember} from '../../../tests/testDataCreation';
import {UserProjectRole} from '../../../binding';
import {UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser, userContext,
} from '../../../tests/graphqlTestEnvironment';
import getContext from '../../../getContext';
import {createBackgroundData, validateBackgroundData} from '../../../tests/backgroundDataCreation';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import {In} from 'typeorm';

describe('modules/project/controller (membership-related mutations)', () => {
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  describe('Mutations for joining/leaving projects', () => {
    const leaveProjectQuery = `mutation ($projectId: ID!) { leaveProject(projectId: $projectId) }`;
    const removeUserFromProjectQuery = `mutation ($projectId: ID!, $userId: ID!) { removeUserFromProject(projectId: $projectId, userId: $userId) }`;
    const requestAccessToProjectQuery = `mutation ($projectId: ID!) { requestAccessToProject(projectId: $projectId) { role } }`;
    const acceptRequestToJoinProjectQuery = `mutation ($projectId: ID!, $userId: ID!) { acceptRequestToJoinProject(projectId: $projectId, userId: $userId) { role } }`;
    const inviteUserToProjectQuery = `mutation ($projectId: ID!, $email: String!) { inviteUserToProject(projectId: $projectId, email: $email) { role } }`;
    const acceptProjectInvitationQuery = `mutation ($projectId: ID!) { acceptProjectInvitation(projectId: $projectId) { role } }`;

    test('User requests access, is accepted, leaves', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);

      await doQuery(requestAccessToProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.PENDING }));
      // TODO: Assert email sent to manager

      await doQuery(acceptRequestToJoinProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.MEMBER }));
      // TODO: Assert email sent to user

      await doQuery(leaveProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('User requests access, is rejected', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);

      await doQuery(requestAccessToProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.PENDING }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('Manager invites user, user accepts, manager removes user from group', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);

      await doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.INVITED }));
      // TODO: Assert email sent to user

      await doQuery(acceptProjectInvitationQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.MEMBER }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('Manager invites user, user declines', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);

      await doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.INVITED }));

      await doQuery(leaveProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('User attempts to accept non-existent invitation', async () => {
      const project = await createTestProject();
      const projectId = project.id;

      await expect(doQuery(acceptProjectInvitationQuery, {projectId})).rejects.toThrow('Unauthorized');
    });

    test('Non-manager attempts to send invitation', async () => {
      const project = await createTestProject();
      const projectId = project.id;

      await expect(doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}))
        .rejects.toThrow('Unauthorized');
    });

    test('Accepting a request to join should mark imported datasets as approved', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.PENDING});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(acceptRequestToJoinProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
      await validateBackgroundData(bgData);
    });

    test('Accepting an invitation should mark imported datasets as approved', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.INVITED});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(acceptProjectInvitationQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
      await validateBackgroundData(bgData);
    });

    test('Leaving a project should mark datasets as unapproved', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(leaveProjectQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: false},
          {datasetId: datasetIds[1], projectId, approved: false},
        ]));
      await validateBackgroundData(bgData);
    });

    test('Removing a user from a project should mark datasets as unapproved', async () => {
      const project = await createTestProject();
      const projectId = project.id;
      const manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      const managerContext = getContext(manager as any, testEntityManager);
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: false},
          {datasetId: datasetIds[1], projectId, approved: false},
        ]));
      await validateBackgroundData(bgData);
    });
  });

  describe('Mutation.importDatasetsIntoProject', () => {
    const importDatasetsIntoProjectQuery = `mutation ($projectId: ID!, $datasetIds: [ID!]!) { importDatasetsIntoProject(projectId: $projectId, datasetIds: $datasetIds) }`;

    test.each([
        [false, UPRO.INVITED],
        [false, UPRO.PENDING],
        [true, UPRO.MEMBER],
        [true, UPRO.MANAGER],
      ] as [boolean, UserProjectRole][])
    (`should set 'approved' to '%s' if the user is a %s`, async (approved, role) => {
      const project = await createTestProject();
      const projectId = project.id;
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(importDatasetsIntoProjectQuery, {projectId, datasetIds});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved},
          {datasetId: datasetIds[1], projectId, approved},
        ]));
      await validateBackgroundData(bgData);
    });
  });
});
