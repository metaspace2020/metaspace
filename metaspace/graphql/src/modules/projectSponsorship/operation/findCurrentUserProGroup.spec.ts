import fetch from 'node-fetch'
import config from '../../../utils/config'
import {
  onAfterAll, onAfterEach, onBeforeAll, onBeforeEach,
  setupTestUsers, testUser, userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestGroup, createTestUserGroup } from '../../../tests/testDataCreation'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
import { findCurrentUserProGroup } from './findCurrentUserProGroup'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

const base = 'https://test-api.metaspace.example'
const activeUrl = (groupId: string) => `${base}/api/subscriptions/group/${groupId}/active`
const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

describe('findCurrentUserProGroup', () => {
  let originalUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalUrl = config.manager_api_url
    config.manager_api_url = base
  })

  afterAll(async() => {
    await onAfterAll()
    config.manager_api_url = originalUrl as any
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockFetch.mockReset()
  })

  afterEach(onAfterEach)

  it('returns null without querying when the user has no groups', async() => {
    expect(await findCurrentUserProGroup(userContext)).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('queries the primary group first and returns the first group with an active subscription', async() => {
    const primary = await createTestGroup({ name: 'primary', shortName: 'prim' })
    const other = await createTestGroup({ name: 'other', shortName: 'oth' })
    await createTestUserGroup(testUser.id, other.id, UGRO.MEMBER, false)
    await createTestUserGroup(testUser.id, primary.id, UGRO.GROUP_ADMIN, true)
    mockFetch.mockImplementation((url: string) => Promise.resolve(
      url === activeUrl(other.id) ? jsonResponse(200, { id: 's1' }) : jsonResponse(404, { message: 'none' })
    ))

    const result = await findCurrentUserProGroup(userContext)

    expect(result && result.id).toBe(other.id)
    expect(mockFetch.mock.calls.map(c => c[0])).toEqual([activeUrl(primary.id), activeUrl(other.id)])
  })

  it('never queries PENDING or INVITED memberships', async() => {
    const pending = await createTestGroup({ name: 'pending', shortName: 'pend' })
    const invited = await createTestGroup({ name: 'invited', shortName: 'inv' })
    await createTestUserGroup(testUser.id, pending.id, UGRO.PENDING, false)
    await createTestUserGroup(testUser.id, invited.id, UGRO.INVITED, false)
    mockFetch.mockResolvedValue(jsonResponse(200, { id: 's1' }))

    expect(await findCurrentUserProGroup(userContext)).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when the manager service is unreachable', async() => {
    const group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, true)
    mockFetch.mockRejectedValue(new Error('network'))

    expect(await findCurrentUserProGroup(userContext)).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
