jest.mock('../../utils/smAPI');
import * as _mockSmApi from '../../utils/smAPI';
const mockSmApi = _mockSmApi as jest.Mocked<typeof _mockSmApi>;

import {Project as ProjectType} from '../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions} from './model';
import {
  adminContext,
  anonContext,
  doQuery,
  onAfterAll, onAfterEach,
  onBeforeAll, onBeforeEach,
  shallowFieldsOfSchemaType,
  testEntityManager, testUser,
} from '../../tests/graphqlTestEnvironment';


describe('modules/project/controller', () => {
  const projectFields = shallowFieldsOfSchemaType('Project');
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  describe('Mutation.createProject', () => {
    const projectDetails = {
      name: 'foo',
      isPublic: false,
    };
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'foo',
    };
    const createProject = `mutation ($projectDetails: CreateProjectInput!) {
      createProject(projectDetails: $projectDetails) { ${projectFields} }
    }`;

    it('should create a project when run as a user', async () => {
      // Act
      const result = await doQuery<ProjectType>(createProject, {projectDetails});

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, result.id, {relations: ['members']});
      expect(result).toEqual(expect.objectContaining({
        ...projectDetails,
        currentUserRole: 'MANAGER',
        numDatasets: 0,
        numMembers: 1,
      }));
      expect(project).toEqual(expect.objectContaining({
        ...projectDetails,
        urlSlug: null,
        members: [
          expect.objectContaining({
            userId,
            role: UserProjectRoleOptions.MANAGER,
          }),
        ],
      }));
    });
    it('should not work when logged out', async () => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails }, { context: anonContext });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should reject a urlSlug from a user', async () => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails: projectDetailsWithSlug });

      // Assert
      await expect(promise).rejects.toThrow();
    });
    it('should not reject a urlSlug from an admin', async () => {
      // Act
      const result = await doQuery<ProjectType>(createProject,
        { projectDetails: projectDetailsWithSlug }, { context: adminContext });

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, result.id);
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
    });
  });

  describe('Mutation.updateProject', () => {
    let projectId: string;
    let initialProject: Pick<ProjectType, 'name' | 'isPublic' | 'urlSlug'>;
    const projectDetails = {
      name: 'bar',
      isPublic: false,
    };
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'bar',
    };
    const updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
      updateProject(projectId: $projectId, projectDetails: $projectDetails) { ${projectFields} }
    }`;
    
    beforeEach(async () => {
      initialProject = { // reinitialize every time because testEntityManager.insert modifies it
        name: 'foo',
        isPublic: true,
        urlSlug: 'foo',
      };
      const insertResult = await testEntityManager.insert(ProjectModel, initialProject);
      projectId = insertResult.identifiers[0].id;
    });
    
    it('should update a project when run as a MANAGER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      const result = await doQuery<ProjectType>(updateProject, {projectId, projectDetails});

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, projectId, {relations: ['members']});
      expect(result).toEqual(expect.objectContaining(projectDetails));
      expect(project).toEqual(expect.objectContaining(projectDetails));
      expect(project.urlSlug).toEqual(initialProject.urlSlug);
    });
    it('should fail when run as a MEMBER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MEMBER});

      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should fail when not in the project', async () => {
      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
    });
    it('should reject a urlSlug change from a user', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      const promise = doQuery<ProjectType>(updateProject, {projectId, projectDetails: projectDetailsWithSlug});

      // Assert
      await expect(promise).rejects.toThrow();
    });
    it('should not reject a urlSlug from an admin', async () => {
      // Act
      const result = await doQuery<ProjectType>(updateProject,
        { projectId, projectDetails: projectDetailsWithSlug }, { context: adminContext });

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, projectId);
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug);
    });
  });

  describe('Mutation.deleteProject', () => {
    let projectId: string;
    const deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`;

    beforeEach(async () => {
      const insertResult = await testEntityManager.insert(ProjectModel, { name: 'foo' });
      projectId = insertResult.identifiers[0].id;
    });

    it('should delete a project when run as a MANAGER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should delete a project when run as an admin', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should fail when run as a MEMBER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UserProjectRoleOptions.MEMBER});

      // Act
      const promise = doQuery(deleteProject, { projectId });

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized');
      const project = await testEntityManager.findOne(ProjectModel, projectId);
      await expect(project).toEqual(expect.anything());
    });
  });

// ## Managing project users
//   leaveProject(projectId: ID!): Boolean!
//   removeUserFromProject(projectId: ID!, userId: ID!): Boolean!
//
// ## User requests access
//   requestAccessToProject(projectId: ID!): UserProject!
//   acceptRequestToJoinProject(projectId: ID!, userId: ID!): UserProject!
// # User can reject request with `leaveProject`
//
//     ## Project invites user
//   inviteUserToProject(projectId: ID!, email: String!): UserProject!
//   acceptProjectInvitation(projectId: ID!): UserProject!
// # Project can reject user with `removeUserFromProject`
//
//     importDatasetsIntoProject(projectId: ID!, datasetIds: [ID!]!): Boolean!

});
