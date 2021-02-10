import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { Project as ProjectModel, UserProjectRoleOptions as UPRO } from '../model'
import { ExternalLink } from '../ExternalLink'
import { PublicationStatusOptions as PSO } from '../Publishing'
import { createTestProject, createTestUserProject } from '../../../tests/testDataCreation'

describe('Project external links', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
  })
  afterEach(onAfterEach)

  interface ResultType {
    id: string;
    externalLinks: ExternalLink[] | null;
  }
  const addLink = async(projectId: string, provider: string, link: string, replaceExisting: boolean) =>
    await doQuery<ResultType>(`
    mutation($projectId: ID!, $provider: String!, $link: String!, $replaceExisting: Boolean!) {
      addProjectExternalLink(projectId: $projectId, provider: $provider, link: $link, replaceExisting: $replaceExisting) {
        id
        externalLinks { provider link }
      }
    }`, { projectId, provider, link, replaceExisting })
  const removeLink = async(projectId: string, provider: string, link?: string) =>
    await doQuery<ResultType>(`
    mutation($projectId: ID!, $provider: String!, $link: String) {
      removeProjectExternalLink(projectId: $projectId, provider: $provider, link: $link) {
        id
        externalLinks { provider link }
      }
    }`, { projectId, provider, link })
  const provider = 'MetaboLights'
  const link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'
  const link2 = 'https://www.ebi.ac.uk/metabolights/MTBLS317'
  const link3 = 'https://www.ebi.ac.uk/metabolights/MTBLS378'

  const DOIProvider = 'DOI'
  const DOILink = 'https://doi.org/10.1038/nmeth.4072'

  it('Should be able to add links', async() => {
    const projectId = (await createTestProject()).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)

    const result1 = await addLink(projectId, provider, link, false)
    await addLink(projectId, provider, link, false) // Duplication should do nothing
    const result2 = await addLink(projectId, provider, link2, false)

    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(updatedProject.externalLinks).toEqual([{ provider, link }, { provider, link: link2 }])
    expect(result1.id).toEqual(projectId)
    expect(result1.externalLinks).toEqual([{ provider, link }])
    expect(result2.externalLinks).toEqual(updatedProject.externalLinks)
  })

  it('Should be able to overwrite existing links', async() => {
    const projectId = (await createTestProject()).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)
    await addLink(projectId, provider, link, false)
    await addLink(projectId, provider, link2, false)

    const result = await addLink(projectId, provider, link3, true)

    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(result.id).toEqual(projectId)
    expect(result.externalLinks).toEqual([
      { provider, link: link3 },
    ])
    expect(updatedProject.externalLinks).toEqual(result.externalLinks)
  })

  it('Should be able to remove specific links', async() => {
    const projectId = (await createTestProject()).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)
    await addLink(projectId, provider, link, false)
    await addLink(projectId, provider, link2, false)

    const result = await removeLink(projectId, provider, link2)

    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(updatedProject.externalLinks).toEqual([
      { provider, link },
    ])
    expect(result.id).toEqual(projectId)
    expect(result.externalLinks).toEqual(updatedProject.externalLinks)
  })

  it('Should be able to remove all links from a provider', async() => {
    const projectId = (await createTestProject()).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)
    await addLink(projectId, provider, link, false)
    await addLink(projectId, provider, link2, false)

    const result = await removeLink(projectId, provider)

    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(updatedProject.externalLinks).toEqual([])
    expect(result.id).toEqual(projectId)
    expect(result.externalLinks).toEqual(updatedProject.externalLinks)
  })

  it('Should be able to add DOI links from doi.org', async() => {
    const projectId = (await createTestProject({ publicationStatus: PSO.PUBLISHED })).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)

    const result1 = await addLink(projectId, DOIProvider, DOILink, false)

    expect(result1.id).toEqual(projectId)
    expect(result1.externalLinks).toEqual([{ provider: DOIProvider, link: DOILink }])

    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(updatedProject.externalLinks).toEqual([{ provider: DOIProvider, link: DOILink }])
  })

  it('Should not be able to add DOI links not from doi.org', async() => {
    const projectId = (await createTestProject({ publicationStatus: PSO.PUBLISHED })).id
    await createTestUserProject(testUser.id, projectId, UPRO.MANAGER)

    const promise = addLink(projectId, DOIProvider, link, false)

    await expect(promise).rejects.toThrow('DOI link should start with "https://doi.org/"')
    const updatedProject = await testEntityManager.findOneOrFail(ProjectModel, projectId)
    expect(updatedProject.externalLinks).toBe(null)
  })
})
