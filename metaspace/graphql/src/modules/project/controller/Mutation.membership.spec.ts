import {createTestDataset, createTestProject, createTestProjectMember} from '../../../tests/testDataCreation';
import {UserProjectRole} from '../../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {User as UserModel} from '../../user/model';
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
import {BackgroundData, createBackgroundData, validateBackgroundData} from '../../../tests/backgroundDataCreation';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import {In} from 'typeorm';
import {Context} from '../../../context';

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

    let project: ProjectModel;
    let projectId: string;
    let manager: UserModel;
    let managerContext: Context;
    let bgData: BackgroundData;

    beforeEach(async () => {
      project = await createTestProject();
      projectId = project.id;
      manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      managerContext = getContext(manager as any, testEntityManager);
      bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId, manager.id],
      });
    });
    afterEach(async () => {
      await validateBackgroundData(bgData);
    });


    test('User requests access, is accepted, leaves', async () => {
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
      await doQuery(requestAccessToProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.PENDING }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('Manager invites user, user accepts, manager removes user from group', async () => {
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
      await doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.INVITED }));

      await doQuery(leaveProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('User attempts to accept non-existent invitation', async () => {
      await expect(doQuery(acceptProjectInvitationQuery, {projectId})).rejects.toThrow('Unauthorized');
    });

    test('Non-manager attempts to send invitation', async () => {
      await expect(doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}))
        .rejects.toThrow('Unauthorized');
    });

    test('Accepting a request to join should mark imported datasets as approved', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.PENDING});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));

      await doQuery(acceptRequestToJoinProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
    });

    test('Accepting an invitation should mark imported datasets as approved', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.INVITED});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));

      await doQuery(acceptProjectInvitationQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
    });

    test('Leaving a project should remove imported datasets', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));

      await doQuery(leaveProjectQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual([]);
    });

    test('Removing a user from a project should remove imported datasets', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual([]);
    });
  });

  describe('Mutation.importDatasetsIntoProject', () => {
    const importDatasetsIntoProjectQuery = `mutation ($projectId: ID!, $datasetIds: [ID!]!) { importDatasetsIntoProject(projectId: $projectId, datasetIds: $datasetIds) }`;

    test.each([
        [false, UPRO.INVITED],
        [false, UPRO.PENDING],
        [true, UPRO.MEMBER],
        [true, UPRO.MANAGER],
      ])
    (`should set 'approved' to '%s' if the user is a %s`, async (approved: boolean, role: UserProjectRole) => {
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
