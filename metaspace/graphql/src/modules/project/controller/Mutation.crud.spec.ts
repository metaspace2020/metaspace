import { createTestProject } from '../../../tests/testDataCreation'
import { Project as ProjectType } from '../../../binding'
import { Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../model'
import {
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
} from '../../../tests/graphqlTestEnvironment'
import { createBackgroundData, validateBackgroundData } from '../../../tests/backgroundDataCreation'
import fetch from 'node-fetch'
import config from '../../../utils/config'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

describe('modules/project/controller (CRUD mutations)', () => {
  const projectFields = shallowFieldsOfSchemaType('Project')
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  describe('Mutation.createProject', () => {
    const projectDetails = {
      name: 'foo',
      isPublic: false,
    }
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'foo_bar',
    }
    const createProject = `mutation ($projectDetails: CreateProjectInput!) {
      createProject(projectDetails: $projectDetails) { ${projectFields} }
    }`

    it('should create a project when run as a user', async() => {
      // Act
      const result = await doQuery<ProjectType>(createProject, { projectDetails })

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, result.id, { relations: ['members'] })
      expect(result).toEqual(expect.objectContaining({
        ...projectDetails,
        currentUserRole: 'MANAGER',
        numDatasets: 0,
        numMembers: 1,
      }))
      expect(project).toEqual(expect.objectContaining({
        ...projectDetails,
        urlSlug: null,
        members: [
          expect.objectContaining({
            userId,
            role: UPRO.MANAGER,
          }),
        ],
      }))
    })
    it('should not work when logged out', async() => {
      // Act
      const promise = doQuery<ProjectType>(createProject, { projectDetails }, { context: anonContext })

      // Assert
      await expect(promise).rejects.toThrow('Unauthenticated')
    })
    it('should not reject a urlSlug from a user', async() => {
      // Act
      const result = await doQuery<ProjectType>(createProject, { projectDetails: projectDetailsWithSlug })

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, result.id)
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug)
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug)
    })
  })

  describe('Mutation.updateProject', () => {
    let projectId: string
    let initialProject: ProjectModel
    const projectDetails = {
      name: 'bar',
      isPublic: false,
    }
    const projectDetailsWithSlug = {
      ...projectDetails,
      urlSlug: 'foo_bar',
    }
    const updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
      updateProject(projectId: $projectId, projectDetails: $projectDetails) { ${projectFields} }
    }`

    beforeEach(async() => {
      initialProject = await createTestProject({
        name: 'foo',
        isPublic: true,
        urlSlug: 'bar_baz',
      })
      projectId = initialProject.id
    })

    it('should update a project when run as a MANAGER of the project', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })

      // Act
      const result = await doQuery<ProjectType>(updateProject, { projectId, projectDetails })

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, projectId, { relations: ['members'] })
      expect(result).toEqual(expect.objectContaining(projectDetails))
      expect(project).toEqual(expect.objectContaining(projectDetails))
      expect(project.urlSlug).toEqual(initialProject.urlSlug)
    })
    it('should fail when run as a MEMBER of the project', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MEMBER })

      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails })

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized')
    })
    it('should fail when not in the project', async() => {
      // Act
      const promise = doQuery(updateProject, { projectId, projectDetails })

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized')
    })
    it('should reject a urlSlug change from a member', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MEMBER })

      // Act
      const promise = doQuery<ProjectType>(updateProject, { projectId, projectDetails: projectDetailsWithSlug })

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized')
    })
    it('should not reject a urlSlug from the manager', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })

      // Act
      const result = await doQuery<ProjectType>(updateProject,
        { projectId, projectDetails: projectDetailsWithSlug }, { context: userContext })

      // Assert
      const project = await testEntityManager.findOneOrFail(ProjectModel, projectId)
      expect(result.urlSlug).toEqual(projectDetailsWithSlug.urlSlug)
      expect(project.urlSlug).toEqual(projectDetailsWithSlug.urlSlug)
    })
  })

  describe('Mutation.deleteProject', () => {
    let projectId: string

    const deleteProject = `mutation ($projectId: ID!) {
      deleteProject(projectId: $projectId)
    }`

    beforeEach(async() => {
      projectId = (await createTestProject()).id
    })

    it('should delete a project when run as a MANAGER of the project', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })
      const bgData = await createBackgroundData({
        users: true,
        projects: true,
        datasets: true,
        projectsForUserIds: [userId],
        datasetsForUserIds: [userId],
      })

      // Act
      await doQuery(deleteProject, { projectId })

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId)
      expect(project).toEqual(undefined)
      await validateBackgroundData(bgData)
    })
    it('should delete a project when run as an admin', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })

      // Act
      await doQuery(deleteProject, { projectId })

      // Assert
      const project = await testEntityManager.findOne(ProjectModel, projectId)
      expect(project).toEqual(undefined)
    })
    it('should fail when run as a MEMBER of the project', async() => {
      // Arrange
      await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MEMBER })

      // Act
      const promise = doQuery(deleteProject, { projectId })

      // Assert
      await expect(promise).rejects.toThrow('Unauthorized')
      const project = await testEntityManager.findOne(ProjectModel, projectId)
      expect(project).toEqual(expect.anything())
    })

    describe('sponsorship cleanup', () => {
      const managerApiUrl = 'https://test-api.metaspace.example'
      let originalManagerApiUrl: string | undefined

      beforeEach(() => {
        originalManagerApiUrl = config.manager_api_url
        config.manager_api_url = managerApiUrl
        mockFetch.mockReset()
      })
      afterEach(() => {
        if (originalManagerApiUrl !== undefined) {
          config.manager_api_url = originalManagerApiUrl
        } else {
          delete (config as any).manager_api_url
        }
      })

      it('should delete the project sponsorship when run as a MANAGER of the project', async() => {
        // Arrange
        await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })
        mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) })

        // Act
        await doQuery(deleteProject, { projectId })

        // Assert
        expect(mockFetch).toHaveBeenCalledWith(
          `${managerApiUrl}/api/project-sponsorships/project/${projectId}`,
          expect.objectContaining({ method: 'DELETE' })
        )
        const project = await testEntityManager.findOne(ProjectModel, projectId)
        expect(project).toEqual(undefined)
      })
      it('should still delete the project when the manager service is unreachable', async() => {
        // Arrange
        await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

        // Act
        const result = await doQuery(deleteProject, { projectId })

        // Assert
        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/project-sponsorships/project/${projectId}`),
          expect.objectContaining({ method: 'DELETE' })
        )
        const project = await testEntityManager.findOne(ProjectModel, projectId)
        expect(project).toEqual(undefined)
      })
      it('should skip the manager service when manager_api_url is not configured', async() => {
        // Arrange
        await testEntityManager.insert(UserProjectModel, { userId, projectId, role: UPRO.MANAGER })
        config.manager_api_url = ''

        try {
          // Act
          const result = await doQuery(deleteProject, { projectId })

          // Assert
          expect(result).toBe(true)
          expect(mockFetch).not.toHaveBeenCalled()
          const project = await testEntityManager.findOne(ProjectModel, projectId)
          expect(project).toEqual(undefined)
        } finally {
          config.manager_api_url = managerApiUrl
        }
      })
    })
  })
})
