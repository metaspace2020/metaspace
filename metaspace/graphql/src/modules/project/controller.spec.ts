
jest.mock('../../utils/smAPI');
import * as _mockSmApi from '../../utils/smAPI';
const mockSmApi = _mockSmApi as jest.Mocked<typeof _mockSmApi>;

import {Context} from '../../context';
import {Project as ProjectType, UserProjectRole} from '../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from './model';
import {User as UserModel} from '../user/model';
import {Credentials as CredentialsModel} from '../auth/model';
import {
  adminContext,
  anonContext,
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  shallowFieldsOfSchemaType,
  testEntityManager,
  testUser, userContext,
} from '../../tests/graphqlTestEnvironment';


// ROLE_COMBOS is a list of possible user & project role combinations, for tests that should exhaustively check every possibility
// When running Jest against a single file, it shows a concise list of all sub-tests, which makes it easy to see patterns
// of failures across the different combinations
type UserRole = 'anon' | 'user' | 'admin';
type ProjectRole = UserProjectRole | null;
const ROLE_COMBOS: [UserRole, ProjectRole][] = [
  ['anon', null],
  ['user', null],
  ['user', UPRO.PENDING],
  ['user', UPRO.INVITED],
  ['user', UPRO.MEMBER],
  ['user', UPRO.MANAGER],
  ['admin', null],
  ['admin', UPRO.PENDING],
  ['admin', UPRO.INVITED],
  ['admin', UPRO.MEMBER],
  ['admin', UPRO.MANAGER],
];
const getContextByRole = (userRole: UserRole) => ({
  'anon': anonContext,
  'user': userContext,
  'admin': adminContext,
} as Record<UserRole, Context>)[userRole];

describe('modules/project/controller', () => {
  const projectFields = shallowFieldsOfSchemaType('Project');

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
  });
  afterEach(onAfterEach);

  describe('Query.project', () => {
    const query = `query ($projectId: ID!) {
      project (projectId: $projectId) { ${projectFields} }
    }`;
    const membersQuery = `query ($projectId: ID!) {
      project (projectId: $projectId) { members { role user { id name email } } }
    }`;

    const setupProject = async (userRole: UserRole, projectRole: ProjectRole,
                                options?: {isPublic?: boolean, otherMemberRole?: ProjectRole}) => {
      const {isPublic = false, otherMemberRole = null} = options || {};

      const project = await testEntityManager.save(ProjectModel, {name: 'Test Project', isPublic}) as ProjectModel;
      const projectId = project.id;
      const context = getContextByRole(userRole);
      const userId = context.user && context.user.id;

      if (userId != null) {
        if (projectRole != null) {
          await testEntityManager.save(UserProjectModel, { userId, projectId, role: projectRole });
        } else {
          await testEntityManager.delete(UserProjectModel, { userId, projectId });
        }
      }

      let otherMember: UserModel | null = null;
      if (otherMemberRole != null) {
        const otherMemberCreds = await testEntityManager.save(CredentialsModel, {}) as any as CredentialsModel;
        otherMember = await testEntityManager.save(UserModel, {
          name: 'Other member',
          email: 'other@member.com',
          credentialsId: otherMemberCreds.id
        }) as UserModel;
        await testEntityManager.save(UserProjectModel, {userId: otherMember.id, projectId, role: otherMemberRole});
      }

      return {project, projectId, context, userId, otherMember}
    };

    describe('should give access to all public projects', () => {
      it.each(ROLE_COMBOS)('user role: %s, group role: %s', async (userRole, projectRole) => {
        // Arrange
        const { project, projectId, context, userId } = await setupProject(userRole, projectRole, {isPublic: true});

        // Act
        const result = await doQuery(query, { projectId }, { context });

        // Assert
        expect(result).toEqual(expect.objectContaining({
          id: project.id,
          name: project.name,
          urlSlug: project.urlSlug,
          isPublic: project.isPublic,
          createdDT: project.createdDT.toISOString(),
          currentUserRole: projectRole,
        }));
      });
    });

    describe('should hide private projects from logged-out users and unaffiliated users', () => {
      it.each(ROLE_COMBOS)('user role: %s, group role: %s', async (userRole: UserRole, projectRole: ProjectRole) => {
        // Arrange
        const { projectId, context } = await setupProject(userRole, projectRole);

        // Act
        const result = await doQuery(query, {projectId}, {context});

        // Assert
        if (userRole === 'admin' || projectRole != null) {
          expect(result).toEqual(expect.objectContaining({
            isPublic: false,
            currentUserRole: projectRole,
            numMembers: ([UPRO.MEMBER, UPRO.MANAGER] as ProjectRole[]).includes(projectRole) ? 1 : 0
          }));
        } else {
          expect(result).toEqual(null);
        }
      });
    });

    describe('should show group members to admins and other members', () => {
      it.each(ROLE_COMBOS)('user role: %s, group role: %s', async (userRole: UserRole, projectRole: ProjectRole) => {
        // Arrange
        const { projectId, context, otherMember } = await setupProject(userRole, projectRole,
          {isPublic: true, otherMemberRole: UPRO.MEMBER});

        // Act
        const result = await doQuery(membersQuery, {projectId}, {context});

        // Assert
        // Flatten & extract fields of interest to improve readability
        const members = result && result.members && (result.members as any[])
          .map(({user: {id, name, email}}) => ({id, name, email}));

        let expectedMembers;
        if (userRole === 'admin' || projectRole === UPRO.MANAGER) {
          const {id, name, email} = otherMember!;
          expectedMembers = expect.arrayContaining([{id, name, email}]);
        } else if (projectRole === UPRO.MEMBER) {
          const {id, name} = otherMember!;
          expectedMembers = expect.arrayContaining([{id, name, email: null}]);
        } else {
          expectedMembers = null;
        }

        expect(members).toEqual(expectedMembers);
      });
    });
  });

  describe('Mutation.createProject', () => {
    let userId: string;
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

    beforeEach(async () => {
      userId = testUser.id;
    });

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
            role: UPRO.MANAGER,
          }),
        ],
      }));
    });
    it('should not work when logged out', async () => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails }, { context: anonContext });

      // Assert
      await expect(promise).rejects.toThrow('Unauthenticated');
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
    let userId: string;
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
      userId = testUser.id;
    });
    
    it('should update a project when run as a MANAGER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MANAGER});

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
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});

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
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MANAGER});

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
    let userId: string;

    const deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`;

    beforeEach(async () => {
      const insertResult = await testEntityManager.insert(ProjectModel, { name: 'foo' });
      projectId = insertResult.identifiers[0].id;
      userId = testUser.id;
    });

    it('should delete a project when run as a MANAGER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should delete a project when run as an admin', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MANAGER});

      // Act
      await doQuery(deleteProject, {projectId});

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId);
      expect(project).toEqual(undefined);
    });
    it('should fail when run as a MEMBER of the project', async () => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});

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
