import {
  adminContext, doQuery, onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testUser,
} from '../../../tests/graphqlTestEnvironment'
import {
  createTestGroup, createTestProject, createTestUserGroup, createTestUserProject,
} from '../../../tests/testDataCreation'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
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

describe('modules/projectSponsorship/controller (queries)', () => {
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

  const query = `query($projectId: ID!) {
    projectSponsorship(projectId: $projectId) {
      projectId proGroupId sponsorUserId entitlements createdAt proGroup { id name }
    }
  }`

  it('returns null when the manager service answers 404', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockResolvedValue(jsonResponse(404, { message: 'Not found' }))

    const result = await doQuery(query, { projectId: project.id })

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('maps keys to enum values and resolves proGroup', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    const group = await createTestGroup({ name: 'Pro lab' })
    mockFetch.mockResolvedValue(jsonResponse(200, {
      id: '1',
      projectId: project.id,
      proGroupId: group.id,
      sponsorUserId: testUser.id,
      entitlements: ['experiments', 'diffAnalysis'],
      isActive: true,
      createdAt: '2026-11-03T10:00:00.000Z',
    }))

    const result = await doQuery(query, { projectId: project.id })

    expect(result).toEqual({
      projectId: project.id,
      proGroupId: group.id,
      sponsorUserId: testUser.id,
      entitlements: ['EXPERIMENTS', 'DIFF_ANALYSIS'],
      createdAt: '2026-11-03T10:00:00.000Z',
      proGroup: { id: group.id, name: 'Pro lab' },
    })
  })

  it('resolves proGroup to null when the group no longer exists', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    const missingGroupId = '00000000-0000-0000-0000-000000000000'
    mockFetch.mockResolvedValue(jsonResponse(200, {
      id: '1',
      projectId: project.id,
      proGroupId: missingGroupId,
      sponsorUserId: testUser.id,
      entitlements: ['segmentation'],
      isActive: true,
      createdAt: '2026-11-03T10:00:00.000Z',
    }))

    const result = await doQuery(query, { projectId: project.id })

    expect(result.proGroupId).toEqual(missingGroupId)
    expect(result.proGroup).toBeNull()
  })

  it('rejects a user who is not in the project', async() => {
    const project = await createTestProject({ isPublic: false })
    mockFetch.mockResolvedValue(jsonResponse(404))

    await expect(doQuery(query, { projectId: project.id })).rejects.toThrow(/Unauthorized|Not authorized/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('allows reviewers and returns null when the manager service answers 404', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.REVIEWER)
    mockFetch.mockResolvedValue(jsonResponse(404, { message: 'Not found' }))

    const result = await doQuery(query, { projectId: project.id })

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('allows admins', async() => {
    const project = await createTestProject({ isPublic: false })
    mockFetch.mockResolvedValue(jsonResponse(404))

    const result = await doQuery(query, { projectId: project.id }, { context: adminContext })

    expect(result).toBeNull()
  })
  it('returns null and does not throw when the manager service answers 500', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockResolvedValue(jsonResponse(500, { message: 'Internal error' }))

    const result = await doQuery(query, { projectId: project.id })

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns null and does not throw when the manager service times out', async() => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, UPRO.MEMBER)
    mockFetch.mockRejectedValue(new Error('network timeout at: https://test-api.metaspace.example/api'))

    const result = await doQuery(query, { projectId: project.id })

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  const proGroupQuery = 'query { currentUserProGroup { id name currentUserRole } }'

  it('currentUserProGroup returns the pro group', async() => {
    const group = await createTestGroup({ name: 'Pro lab' })
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockFetch.mockResolvedValue(jsonResponse(200, { id: 's1' }))

    const result = await doQuery(proGroupQuery)

    expect(result).toEqual({ id: group.id, name: 'Pro lab', currentUserRole: 'MEMBER' })
    expect(mockFetch.mock.calls[0][0].endsWith(`/api/subscriptions/group/${group.id}/active`)).toBe(true)
  })

  it('currentUserProGroup returns null without a subscription', async() => {
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockFetch.mockResolvedValue(jsonResponse(404, { message: 'Not found' }))

    const result = await doQuery(proGroupQuery)

    expect(result).toBeNull()
  })
})
