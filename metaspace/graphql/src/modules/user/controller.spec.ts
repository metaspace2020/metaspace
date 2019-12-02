import * as _ from 'lodash';
import {
  createTestGroup,
  createTestProject,
  createTestUserGroup,
  createTestUserProject,
} from '../../tests/testDataCreation';
import {UserGroupRole, UserProjectRole} from '../../binding';
import {
  UserProjectRoleOptions as UPRO,
} from '../project/model';
import {
  UserGroupRoleOptions as UGRO,
} from '../group/model';
import {
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
import {createBackgroundData} from '../../tests/backgroundDataCreation';


// ROLE_COMBOS is a list of possible user & project role combinations, for tests that should exhaustively check every possibility
// When running Jest against a single file, it shows a concise list of all sub-tests, which makes it easy to see patterns
// of failures across the different combinations
type UserRole = 'anon' | 'user' | 'admin';


describe('modules/user/controller', () => {
  let userId: string;

  const setupProject = async (projectRole: UserProjectRole | null, isPublic: boolean) => {
    const project = await createTestProject({isPublic, name: `${projectRole} project`});
    await createTestUserProject(userContext.user.id!, project.id, projectRole);
    return project;
  };

  const setupGroup = async (groupRole: UserGroupRole, primary: boolean) => {
    const group = await createTestGroup();
    await createTestUserGroup(userContext.user.id!, group.id, groupRole, primary);
    return group;
  };

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  describe('Query.currentUser', () => {
    const query = `query {
      currentUser {
        ${shallowFieldsOfSchemaType('User')}
        groups {
          ${shallowFieldsOfSchemaType('UserGroup')}
          group {
            ${shallowFieldsOfSchemaType('Group')}
          }
        }
        primaryGroup {
          ${shallowFieldsOfSchemaType('UserGroup')}
          group {
            ${shallowFieldsOfSchemaType('Group')}
          }
        }
        projects {
          ${shallowFieldsOfSchemaType('UserProject')}
          project {
            ${shallowFieldsOfSchemaType('Project')}
          }
        }
      }
    }`;

    describe('should include project in currentUser.projects', () => {
      const ROLE_COMBOS: [UserProjectRole | null, boolean, boolean][] = [
        [null, false, false],
        [UPRO.PENDING, false, false],
        [UPRO.INVITED, false, true],
        [UPRO.MEMBER, false, true],
        [UPRO.MANAGER, false, true],
        [UPRO.REVIEWER, false, true],
        [UPRO.PENDING, true, true],
        [UPRO.INVITED, true, true],
        [UPRO.MEMBER, true, true],
        [UPRO.MANAGER, true, true],
        [UPRO.REVIEWER, true, true],
      ];
      it.each(ROLE_COMBOS)('project role: %s, project.isPublic: %s, expected: %s',
        async (projectRole, isPublic, expected) => {
          // Arrange
          const project = await setupProject(projectRole, isPublic);

          // Act
          const result = await doQuery(query, { }, { context: userContext });

          // Assert
          expect(result.projects).toEqual(!expected ? [] : [
            expect.objectContaining({
              project: expect.objectContaining({id: project.id}),
              role: projectRole,
            })
          ]);
        });
    });

    it('should match snapshot', async () => {
      // Arrange
      await createBackgroundData({projects: true, users: true});
      await setupProject(UPRO.MEMBER, false);
      await setupGroup(UGRO.MEMBER, true);
      await setupGroup(UGRO.MEMBER, false);

      // Act
      const result = await doQuery(query, { }, { context: userContext });

      // Assert
      const maskedFields = ['id', 'userId', 'projectId', 'groupId', 'email', 'createdDT'];
      const cleanData = (value: any, key?: any): any => {
        if (_.isObject(value)) {
          return _.mapValues(value, cleanData);
        } else if (_.isArray(value)) {
          return _.map(value, cleanData);
        } else if (maskedFields.includes(key) && value) {
          return 'MASKED';
        } else {
          return value;
        }
      };
      const currentUser = cleanData(result);
      expect(currentUser).toMatchSnapshot();
    });

  });
});
