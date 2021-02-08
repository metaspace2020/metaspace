import {
  adminContext,
  doQuery,
  onAfterAll, onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestDataset,
  createTestProject,
} from '../../../tests/testDataCreation'
import {
  Project as ProjectModel,
  UserProject as UserProjectModel,
  UserProjectRoleOptions,
} from '../model'
import { DatasetProject as DatasetProjectModel } from '../../dataset/model'
import { PublicationStatusOptions as PSO } from '../Publishing'
import { Project as ProjectType } from '../../../binding'

import * as _smApiDatasets from '../../../utils/smApi/datasets'
jest.mock('../../../utils/smApi/datasets')
const mockSmApiDatasets = _smApiDatasets as jest.Mocked<typeof _smApiDatasets>

describe('Project publication status manipulations', () => {
  let userId: string

  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    userId = testUser.id
  })
  afterEach(onAfterEach)

  const createReviewLink = `mutation ($projectId: ID!) {
    createReviewLink(projectId: $projectId) { id isPublic reviewToken publicationStatus }
  }`
  const deleteReviewLink = `mutation ($projectId: ID!) {
    deleteReviewLink(projectId: $projectId)
  }`
  const publishProject = `mutation ($projectId: ID!) {
    publishProject(projectId: $projectId) { id publicationStatus isPublic }
  }`
  const unpublishProject = `mutation ($projectId: ID!, $isPublic: Boolean!) {
    unpublishProject(projectId: $projectId, isPublic: $isPublic) { id publicationStatus isPublic }
  }`
  const deleteProject = `mutation ($projectId: ID!) {
    deleteProject(projectId: $projectId)
  }`
  const updateProject = `mutation ($projectId: ID!, $projectDetails: UpdateProjectInput!) {
    updateProject(projectId: $projectId, projectDetails: $projectDetails) {
      id name urlSlug projectDescription
    }
  }`
  const addExternalLink = `mutation($projectId: ID!) {
    addProjectExternalLink(
      projectId: $projectId,
      provider: "MetaboLights",
      link: "https://www.ebi.ac.uk/metabolights/MTBLS000",
      replaceExisting: true
    ) { id }
  }`
  const removeExternalLink = `mutation($projectId: ID!) {
    removeProjectExternalLink(
      projectId: $projectId,
      provider: "MetaboLights",
      link: "https://www.ebi.ac.uk/metabolights/MTBLS000"
    ) { id }
  }`
  const addDOI = `mutation($projectId: ID!) {
    addProjectExternalLink(
      projectId: $projectId,
      provider: "DOI",
      link: "https://doi.org/xzy123",
      replaceExisting: true
    ) { id }
  }`

  test('Project manager can create/delete review links', async() => {
    const project = await createTestProject({ isPublic: false, publicationStatus: PSO.UNPUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    let result = await doQuery<ProjectType>(createReviewLink, { projectId: project.id })

    expect(result).toEqual(expect.objectContaining(
      { isPublic: false, reviewToken: expect.anything(), publicationStatus: PSO.UNDER_REVIEW }))
    let updatedProject = await testEntityManager.findOne(ProjectModel, { id: project.id })
    expect(updatedProject).toEqual(expect.objectContaining({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW }))

    result = await doQuery<ProjectType>(deleteReviewLink, { projectId: project.id })

    expect(result).toBe(true)
    updatedProject = await testEntityManager.findOne(ProjectModel, { id: project.id })
    expect(updatedProject).toEqual(expect.objectContaining({ isPublic: false, publicationStatus: PSO.UNPUBLISHED }))
  })

  test('Project member cannot create review link', async() => {
    const project = await createTestProject({ isPublic: true, publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(
      UserProjectModel, { userId, projectId: project.id, role: UserProjectRoleOptions.MEMBER }
    )

    const promise = doQuery<ProjectType>(createReviewLink, { projectId: project.id })

    await expect(promise).rejects.toThrow(/Unauthorized/)
  })

  test('Project manager can publish project', async() => {
    const project = await createTestProject({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })
    const datasetBelongsToProject = await createTestDataset({}, { isPublic: false })
    await testEntityManager.insert(DatasetProjectModel,
      { datasetId: datasetBelongsToProject.id, projectId: project.id, approved: true })
    const randomDataset = await createTestDataset({}, { isPublic: false })

    const result = await doQuery<ProjectType>(publishProject, { projectId: project.id })

    expect(result).toEqual(expect.objectContaining({ publicationStatus: PSO.PUBLISHED, isPublic: true }))
    const updatedProject = await testEntityManager.findOne(ProjectModel, { id: project.id })
    expect(updatedProject).toEqual(expect.objectContaining({ publicationStatus: PSO.PUBLISHED, isPublic: true }))

    expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalledWith(datasetBelongsToProject.id, { isPublic: true }, { asyncEsUpdate: true })
    expect(mockSmApiDatasets.smApiUpdateDataset).not.toHaveBeenCalledWith(randomDataset.id, expect.anything(), expect.anything())
  })

  test('Project member cannot publish project', async() => {
    const project = await createTestProject({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW })
    await testEntityManager.insert(
      UserProjectModel, { userId, projectId: project.id, role: UserProjectRoleOptions.MEMBER }
    )

    const promise = doQuery<ProjectType>(publishProject, { projectId: project.id })

    await expect(promise).rejects.toThrow(/Unauthorized/)
  })

  test('Project manager cannot unpublish project', async() => {
    const project = await createTestProject({ isPublic: true, publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const promise = doQuery<ProjectType>(unpublishProject, { projectId: project.id, isPublic: false })

    await expect(promise).rejects.toThrow(/Unauthorized/)
  })

  test('Admins can unpublish project', async() => {
    const project = await createTestProject(
      { isPublic: true, reviewToken: 'random-token', publicationStatus: PSO.PUBLISHED }
    )
    const datasetBelongsToProject = await createTestDataset({}, { isPublic: true })
    await testEntityManager.insert(DatasetProjectModel,
      { datasetId: datasetBelongsToProject.id, projectId: project.id, approved: true })
    const randomDataset = await createTestDataset({}, { isPublic: true })

    const result = await doQuery<ProjectType>(
      unpublishProject, { projectId: project.id, isPublic: false }, { context: adminContext }
    )

    expect(result).toEqual(expect.objectContaining({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW }))
    const updatedProject = await testEntityManager.findOne(ProjectModel, { id: project.id })
    expect(updatedProject).toEqual(expect.objectContaining({ isPublic: false, publicationStatus: PSO.UNDER_REVIEW }))

    expect(mockSmApiDatasets.smApiUpdateDataset).toHaveBeenCalledWith(datasetBelongsToProject.id, { isPublic: false }, { asyncEsUpdate: true })
    expect(mockSmApiDatasets.smApiUpdateDataset).not.toHaveBeenCalledWith(randomDataset.id, expect.anything(), expect.anything())
  })

  test.each([PSO.UNDER_REVIEW, PSO.PUBLISHED])(
    'Not allowed to delete project in %s status',
    async(status) => {
      const project = await createTestProject({ publicationStatus: status })
      await testEntityManager.insert(UserProjectModel,
        { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

      const promise = doQuery<ProjectType>(deleteProject, { projectId: project.id })

      await expect(promise).rejects.toThrow(/Cannot modify project/)
      await testEntityManager.findOneOrFail(ProjectModel, project.id)
    }
  )

  test('Not allowed to make published project private', async() => {
    const project = await createTestProject({ publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const promise = doQuery<ProjectType>(updateProject,
      { projectId: project.id, projectDetails: { isPublic: false } })

    await expect(promise).rejects.toThrow(/Published projects must be visible/)
    const { isPublic } = await testEntityManager.findOneOrFail(ProjectModel, project.id)
    expect(isPublic).toBe(true)
  })

  test.each([PSO.UNDER_REVIEW, PSO.PUBLISHED])(
    'Allowed to update project in %s status',
    async(status) => {
      const project = await createTestProject({ publicationStatus: status })
      await testEntityManager.insert(UserProjectModel,
        { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })
      const projectDetails = {
        name: 'new name',
        projectDescription:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new description"}]}]}',
      }

      const result = await doQuery<ProjectType>(updateProject, { projectId: project.id, projectDetails })

      expect(result).toEqual(expect.objectContaining(projectDetails))
      const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, project.id)
      expect(updatedProject).toEqual(expect.objectContaining(projectDetails))
    }
  )

  test('Allowed to add external link to published project', async() => {
    const project = await createTestProject({ publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const result = await doQuery<ProjectType>(addExternalLink, { projectId: project.id })

    expect(result).toEqual(expect.objectContaining({ id: project.id }))
  })

  test('Allowed to remove external link from published project', async() => {
    const project = await createTestProject({ publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })
    await doQuery<ProjectType>(addExternalLink, { projectId: project.id })

    const result = await doQuery<ProjectType>(removeExternalLink, { projectId: project.id })

    expect(result).toEqual(expect.objectContaining({ id: project.id }))
  })

  test('Allowed to add DOI to published project', async() => {
    const project = await createTestProject({ publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const result = await doQuery<ProjectType>(addDOI, { projectId: project.id })

    expect(result).toEqual(expect.objectContaining({ id: project.id }))
  })

  test('Not allowed to add DOI to unpublished project', async() => {
    const project = await createTestProject({ publicationStatus: PSO.UNDER_REVIEW })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const promise = doQuery<ProjectType>(addDOI, { projectId: project.id })

    await expect(promise).rejects.toThrow(/Cannot add DOI, project is not published/)
    const { externalLinks } = await testEntityManager.findOneOrFail(ProjectModel, project.id)
    expect(externalLinks).toBe(null)
  })

  test('Not allowed to remove urlSlug from project under review', async() => {
    const project = await createTestProject({ urlSlug: 'old-link', publicationStatus: PSO.UNDER_REVIEW })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const promise = doQuery<ProjectType>(updateProject, { projectId: project.id, projectDetails: { urlSlug: null } })

    await expect(promise).rejects.toThrow(/Cannot remove short link as the project is under review/)
    const { urlSlug } = await testEntityManager.findOneOrFail(ProjectModel, project.id)
    expect(urlSlug).toBe('old-link')
  })

  test('Not allowed to edit urlSlug on published project', async() => {
    const project = await createTestProject({ urlSlug: 'old-link', publicationStatus: PSO.PUBLISHED })
    await testEntityManager.insert(UserProjectModel,
      { userId, projectId: project.id, role: UserProjectRoleOptions.MANAGER })

    const promise = doQuery<ProjectType>(updateProject, { projectId: project.id, projectDetails: { urlSlug: 'new-link' } })

    await expect(promise).rejects.toThrow(/Cannot edit short link as the project is published/)
    const { urlSlug } = await testEntityManager.findOneOrFail(ProjectModel, project.id)
    expect(urlSlug).toBe('old-link')
  })
})
