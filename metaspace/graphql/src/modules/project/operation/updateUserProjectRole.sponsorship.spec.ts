import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach, setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject, createTestProjectMember, createTestUserProject } from '../../../tests/testDataCreation'
import { UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../model'
import fetch from 'node-fetch'
import config from '../../../utils/config'

jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

const sponsorship = (projectId: string, sponsorUserId: string) => ({
  id: 'sp-' + projectId,
  projectId,
  proGroupId: 'pro-group',
  sponsorUserId,
  entitlements: ['private_submission'],
  isActive: true,
  createdAt: new Date().toISOString(),
})

const leaveProjectQuery = 'mutation ($projectId: ID!) { leaveProject(projectId: $projectId) }'
const removeUserFromProjectQuery =
  'mutation ($projectId: ID!, $userId: ID!) { removeUserFromProject(projectId: $projectId, userId: $userId) }'

const MANAGER_API = 'https://test-api.metaspace.example'

describe('updateUserProjectRole: sponsorship revoked when the sponsor leaves the project', () => {
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
  })
  afterAll(async() => {
    await onAfterAll()
    config.manager_api_url = originalManagerApiUrl as any
  })
  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    config.manager_api_url = MANAGER_API
    mockFetch.mockReset()
  })
  afterEach(onAfterEach)

  const sponsorshipUrl = (projectId: string) => `${MANAGER_API}/api/project-sponsorships/project/${projectId}`
  const callsTo = (method: string) => mockFetch.mock.calls.filter(([, init]) => init.method === method)

  it('removes the sponsorship when a manager removes the sponsor from the project', async() => {
    const project = await createTestProject()
    const sponsor = await createTestProjectMember(project.id, UPRO.MANAGER)
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    mockFetch.mockImplementation((url: string, init: any) => init.method === 'GET'
      ? jsonResponse(200, sponsorship(project.id, sponsor.id))
      : jsonResponse(204))

    await doQuery(removeUserFromProjectQuery, { projectId: project.id, userId: sponsor.id })

    expect(await testEntityManager.findOne(UserProjectModel, { projectId: project.id, userId: sponsor.id }))
      .toBeUndefined()
    expect(callsTo('DELETE').map(([url]) => url)).toEqual([sponsorshipUrl(project.id)])
  })

  it('removes the sponsorship when the sponsor leaves the project', async() => {
    const project = await createTestProject()
    await createTestProjectMember(project.id, UPRO.MANAGER)
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockImplementation((url: string, init: any) => init.method === 'GET'
      ? jsonResponse(200, sponsorship(project.id, testUser.id))
      : jsonResponse(204))

    await doQuery(leaveProjectQuery, { projectId: project.id })

    expect(await testEntityManager.findOne(UserProjectModel, { projectId: project.id, userId: testUser.id }))
      .toBeUndefined()
    expect(callsTo('DELETE').map(([url]) => url)).toEqual([sponsorshipUrl(project.id)])
  })

  it('keeps the sponsorship when the leaving user is not its sponsor', async() => {
    const project = await createTestProject()
    const sponsor = await createTestProjectMember(project.id, UPRO.MANAGER)
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockResolvedValue(jsonResponse(200, sponsorship(project.id, sponsor.id)))

    await doQuery(leaveProjectQuery, { projectId: project.id })

    expect(await testEntityManager.findOne(UserProjectModel, { projectId: project.id, userId: testUser.id }))
      .toBeUndefined()
    expect(callsTo('GET')).toHaveLength(1)
    expect(callsTo('DELETE')).toHaveLength(0)
  })

  it('still removes the user when the manager service is unreachable', async() => {
    const project = await createTestProject()
    await createTestProjectMember(project.id, UPRO.MANAGER)
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    await doQuery(leaveProjectQuery, { projectId: project.id })

    expect(await testEntityManager.findOne(UserProjectModel, { projectId: project.id, userId: testUser.id }))
      .toBeUndefined()
  })

  it('does not call the manager service when it is not configured', async() => {
    config.manager_api_url = undefined as any
    const project = await createTestProject()
    await createTestProjectMember(project.id, UPRO.MANAGER)
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)

    await doQuery(leaveProjectQuery, { projectId: project.id })

    expect(await testEntityManager.findOne(UserProjectModel, { projectId: project.id, userId: testUser.id }))
      .toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
