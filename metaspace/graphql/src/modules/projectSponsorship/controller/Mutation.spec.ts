import {
  doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestGroup, createTestProject, createTestUserGroup, createTestUserProject,
} from '../../../tests/testDataCreation'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
import fetch from 'node-fetch'
import * as graphqlErrors from 'graphql-errors'
import config from '../../../utils/config'

jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

describe('modules/projectSponsorship/controller (mutations)', () => {
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(async() => {
    await onAfterAll()
    config.manager_api_url = originalManagerApiUrl as any
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockFetch.mockReset()
  })

  afterEach(onAfterEach)

  const remove = 'mutation($projectId: ID!) { removeProjectSponsorship(projectId: $projectId) }'

  it('removeProjectSponsorship: manager → DELETE issued, returns true', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    mockFetch.mockResolvedValue(jsonResponse(204))

    const result = await doQuery(remove, { projectId: project.id })

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url.endsWith(`/api/project-sponsorships/project/${project.id}`)).toBe(true)
    expect(init.method).toBe('DELETE')
  })

  it('removeProjectSponsorship: 404 from manager service still returns true', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    mockFetch.mockResolvedValue(jsonResponse(404, { message: 'Not found' }))

    const result = await doQuery(remove, { projectId: project.id })

    expect(result).toBe(true)
  })

  it('removeProjectSponsorship: DELETE network error → generic "not available" UserError, URL not leaked', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    mockFetch.mockRejectedValue(
      new Error('network timeout at: https://test-api.metaspace.example/api/project-sponsorships'))

    const error = await doQuery(remove, { projectId: project.id }).catch(e => e)

    expect(error.message).toBe('Pro sponsorship is not available')
    expect(error.message).not.toContain('test-api.metaspace.example')
    expect(error.originalError[(graphqlErrors as any).IsUserError]).toBe(true)
  })

  it('removeProjectSponsorship: manager-service 500 message is surfaced as UserError', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    mockFetch.mockResolvedValue(jsonResponse(500, { message: 'boom' }))

    const error = await doQuery(remove, { projectId: project.id }).catch(e => e)

    expect(error.message).toBe('boom')
    expect(error.originalError[(graphqlErrors as any).IsUserError]).toBe(true)
  })

  it('removeProjectSponsorship: member (not manager) is rejected and no fetch happens', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)

    await expect(doQuery(remove, { projectId: project.id })).rejects.toThrow(/Unauthorized/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
  const set = 'mutation($projectId: ID!, $entitlements: [ProjectEntitlement!]!) { '
    + 'setProjectSponsorship(projectId: $projectId, entitlements: $entitlements) { projectId proGroupId entitlements } }'

  const sponsorshipRecord = (projectId: string, proGroupId: string, entitlements: string[]) => ({
    id: 'sp1',
    projectId,
    proGroupId,
    sponsorUserId: testUser.id,
    entitlements,
    isActive: true,
    createdAt: '2026-11-03T10:00:00.000Z',
  })

  /** Routes the subscription check and the sponsorship PUT to different mocked responses. */
  const mockManager = (subscription: any, put: any) => {
    mockFetch.mockImplementation((url: string, init: any) => Promise.resolve(
      init.method === 'PUT' ? put : subscription
    ))
  }

  const putCalls = () => mockFetch.mock.calls.filter(([, init]) => init.method === 'PUT')

  it('setProjectSponsorship: manager in a pro group → PUT with that group and wire keys, response mapped', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    const group = await createTestGroup({ name: 'Pro lab' })
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockManager(
      jsonResponse(200, { id: 's1' }),
      jsonResponse(200, sponsorshipRecord(project.id, group.id, ['experiments', 'segmentation'])),
    )

    const result = await doQuery(set, { projectId: project.id, entitlements: ['EXPERIMENTS', 'SEGMENTATION'] })

    expect(result).toEqual({
      projectId: project.id,
      proGroupId: group.id,
      entitlements: ['EXPERIMENTS', 'SEGMENTATION'],
    })
    expect(putCalls()).toHaveLength(1)
    const [url, init] = putCalls()[0]
    expect(url.endsWith(`/api/project-sponsorships/project/${project.id}`)).toBe(true)
    expect(JSON.parse(init.body)).toEqual({ proGroupId: group.id, entitlements: ['experiments', 'segmentation'] })
  })

  it('setProjectSponsorship: manager without a pro group → UserError, no PUT', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockManager(jsonResponse(404, { message: 'Not found' }), jsonResponse(200))

    await expect(doQuery(set, { projectId: project.id, entitlements: ['EXPERIMENTS'] }))
      .rejects.toThrow('You need an active Pro group to sponsor a project')
    expect(putCalls()).toHaveLength(0)
  })

  it('setProjectSponsorship: member (not manager) → Unauthorized, no PUT', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockManager(jsonResponse(200, { id: 's1' }), jsonResponse(200))

    await expect(doQuery(set, { projectId: project.id, entitlements: ['EXPERIMENTS'] }))
      .rejects.toThrow(/Unauthorized/)
    expect(putCalls()).toHaveLength(0)
  })

  it('setProjectSponsorship: empty entitlements → UserError, no fetch', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)

    await expect(doQuery(set, { projectId: project.id, entitlements: [] }))
      .rejects.toThrow('Select at least one entitlement')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('setProjectSponsorship: manager-service 400 message is surfaced as UserError', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockManager(
      jsonResponse(200, { id: 's1' }),
      jsonResponse(400, { message: 'Entitlement not covered by the subscription' }),
    )

    const error = await doQuery(set, { projectId: project.id, entitlements: ['EXPERIMENTS'] }).catch(e => e)

    expect(error.message).toBe('Entitlement not covered by the subscription')
    // UserError is an ES5 subclass of Error, so instanceof fails; graphql-errors tags it with this symbol instead
    expect(error.originalError[(graphqlErrors as any).IsUserError]).toBe(true)
  })
  it('setProjectSponsorship: PUT network error → generic "not available" UserError, URL not leaked', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MANAGER)
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockFetch.mockImplementation((url: string, init: any) => init.method === 'PUT'
      ? Promise.reject(new Error('network timeout at: https://test-api.metaspace.example/api/project-sponsorships'))
      : Promise.resolve(jsonResponse(200, { id: 's1' })))

    const error = await doQuery(set, { projectId: project.id, entitlements: ['EXPERIMENTS'] }).catch(e => e)

    expect(error.message).toBe('Pro sponsorship is not available')
    expect(error.originalError[(graphqlErrors as any).IsUserError]).toBe(true)
    expect(putCalls()).toHaveLength(1)
  })
})
