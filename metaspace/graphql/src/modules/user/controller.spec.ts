import * as _ from 'lodash'
import {
  createTestGroup,
  createTestProject, createTestUser,
  createTestUserGroup,
  createTestUserProject,
} from '../../tests/testDataCreation'
import { UserGroupRole, UserProjectRole } from '../../binding'
import {
  UserProjectRoleOptions as UPRO,
} from '../project/model'
import {
  UserGroupRoleOptions as UGRO,
} from '../group/model'
import { Credentials as CredentialsModel } from '../auth/model'
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
} from '../../tests/graphqlTestEnvironment'
import { createBackgroundData, validateBackgroundData } from '../../tests/backgroundDataCreation'
import { getContextForTest } from '../../getContext'
import { utc } from 'moment'

describe('modules/user/controller', () => {
  const setupProject = async(projectRole: UserProjectRole | null, isPublic: boolean) => {
    const project = await createTestProject({ isPublic, name: `${projectRole} project` })
    await createTestUserProject(userContext.user.id!, project.id, projectRole)
    return project
  }

  const setupGroup = async(groupRole: UserGroupRole, primary: boolean) => {
    const group = await createTestGroup()
    await createTestUserGroup(userContext.user.id!, group.id, groupRole, primary)
    return group
  }

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

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
    }`

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
      ]
      it.each(ROLE_COMBOS)('project role: %s, project.isPublic: %s, expected: %s',
        async(projectRole, isPublic, expected) => {
          // Arrange
          const project = await setupProject(projectRole, isPublic)

          // Act
          const result = await doQuery(query, { }, { context: userContext })

          // Assert
          expect(result.projects).toEqual(!expected
            ? []
            : [
                expect.objectContaining({
                  project: expect.objectContaining({ id: project.id }),
                  role: projectRole,
                }),
              ])
        })
    })

    it('should match snapshot', async() => {
      // Arrange
      await createBackgroundData({ projects: true, users: true })
      await setupProject(UPRO.MEMBER, false)
      await setupGroup(UGRO.MEMBER, true)
      await setupGroup(UGRO.MEMBER, false)

      // Act
      const result = await doQuery(query, { }, { context: userContext })

      // Assert
      const maskedFields = ['id', 'userId', 'projectId', 'groupId', 'email', 'createdDT']
      const cleanData = (value: any, key?: any): any => {
        if (_.isObject(value)) {
          return _.mapValues(value, cleanData)
        } else if (_.isArray(value)) {
          return _.map(value, cleanData)
        } else if (maskedFields.includes(key) && value) {
          return 'MASKED'
        } else {
          return value
        }
      }
      const currentUser = cleanData(result)
      expect(currentUser).toMatchSnapshot()
    })
  })

  describe('Mutation.resetUserApiKey', () => {
    const query = `mutation($userId: ID!, $removeKey: Boolean!) {
      resetUserApiKey(userId: $userId, removeKey: $removeKey) {
        id
        apiKey
      }
    }`

    it('should generate a 12-digit API key when called by the current user', async() => {
      // Arrange
      const backgroundData = await createBackgroundData({ users: true })

      // Act
      const result = await doQuery(query, { userId: testUser.id, removeKey: false }, { context: userContext })

      // Assert
      const updatedCreds = await testEntityManager.findOneOrFail(CredentialsModel, testUser.credentialsId)
      expect(result.id).toBe(testUser.id)
      expect(result.apiKey).toHaveLength(12)
      expect(result.apiKey).toBe(updatedCreds.apiKey)
      expect(updatedCreds.apiKeyLastUpdated).toBeTruthy()
      await validateBackgroundData(backgroundData)
    })

    it('should set the API key to null when called by the current user with removeKey: true', async() => {
      // Arrange
      const backgroundData = await createBackgroundData({ users: true })
      const startTime = utc().subtract(10, 'days')
      await testEntityManager.update(CredentialsModel, testUser.credentialsId, {
        apiKey: 'ExistingApiKey',
        apiKeyLastUpdated: startTime,
      })

      // Act
      const result = await doQuery(query, { userId: testUser.id, removeKey: true }, { context: userContext })

      // Assert
      const updatedCreds = await testEntityManager.findOneOrFail(CredentialsModel, testUser.credentialsId)
      expect(result.id).toBe(testUser.id)
      expect(result.apiKey).toBeNull()
      expect(updatedCreds.apiKey).toBeNull()
      expect(updatedCreds.apiKeyLastUpdated!.diff(startTime, 'days', true)).toBeCloseTo(10)
      await validateBackgroundData(backgroundData)
    })

    it('should fail when called by a different current user', async() => {
      // Arrange
      await testEntityManager.update(CredentialsModel, testUser.credentialsId, { apiKey: 'ExistingApiKey' })
      const otherUserContext = getContextForTest((await createTestUser()) as any, testEntityManager)

      // Act
      const resultPromise = doQuery(query, { userId: testUser.id, removeKey: false }, { context: otherUserContext })
      await expect(resultPromise).rejects.toThrow()

      // Assert
      const updatedCreds = await testEntityManager.findOneOrFail(CredentialsModel, testUser.credentialsId)
      expect(updatedCreds.apiKey).toBe('ExistingApiKey')
    })
  })
})
