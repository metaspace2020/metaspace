import {createTestProject, createTestProjectMember} from '../../../tests/testDataCreation';
import {Context} from '../../../context';
import {Project as ProjectType, UserProjectRole} from '../../../binding';
import {UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
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
} from '../../../tests/graphqlTestEnvironment';


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

describe('modules/project/controller (queries)', () => {
  const projectFields = shallowFieldsOfSchemaType('Project');
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
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
      const {isPublic = false} = options || {};

      const project = await createTestProject({isPublic});
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

      return {project, projectId, context};
    };

    describe('should give access to all public projects', () => {
      it.each(ROLE_COMBOS)('user role: %s, group role: %s', async (userRole, projectRole) => {
        // Arrange
        const { project, projectId, context } = await setupProject(userRole, projectRole, {isPublic: true});

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
            numMembers: ([UPRO.MEMBER, UPRO.MANAGER] as ProjectRole[]).includes(projectRole) ? 1 : 0,
          }));
        } else {
          expect(result).toEqual(null);
        }
      });
    });

    describe('should show group members to admins and other members', () => {
      it.each(ROLE_COMBOS)('user role: %s, group role: %s', async (userRole: UserRole, projectRole: ProjectRole) => {
        // Arrange
        const { projectId, context } = await setupProject(userRole, projectRole, {isPublic: true});
        const otherMember = await createTestProjectMember(projectId);

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

  describe('Query.projectByUrlSlug', () => {
    const query = `query ($urlSlug: String!) {
      projectByUrlSlug (urlSlug: $urlSlug) { ${projectFields} }
    }`;

    it('should find a project by URL slug', async () => {
      // Create several projects so that we can be sure it's finding the right one, not just the first one
      const projectPromises = ['abc','def','ghi','jkl','mno']
        .map(async urlSlug => await createTestProject({urlSlug}));
      const projects = await Promise.all(projectPromises);
      const urlSlugToFind = 'ghi';
      const matchingProject = projects.find(p => p.urlSlug === urlSlugToFind)!;

      const result = await doQuery<ProjectType>(query, {urlSlug: urlSlugToFind});

      expect(result.id).toEqual(matchingProject.id);
    });
  });
});
