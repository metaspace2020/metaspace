import fetch from 'node-fetch'
import config from '../../utils/config'
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser,
} from '../../tests/graphqlTestEnvironment'
import { createTestGroup, createTestUserGroup } from '../../tests/testDataCreation'
import { Group as GroupModel, UserGroup as UserGroupModel, UserGroupRoleOptions as UGRO } from './model'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

describe('modules/group/controller (sponsorship cleanup on leaveGroup)', () => {
  const managerApiUrl = 'https://test-api.metaspace.example'
  let originalManagerApiUrl: string | undefined
  let group: GroupModel

  const leaveGroup = `mutation ($groupId: ID!) {
    leaveGroup(groupId: $groupId)
  }`

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = managerApiUrl
  })

  afterAll(async() => {
    await onAfterAll()
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      delete (config as any).manager_api_url
    }
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()
    mockFetch.mockReset()
    group = await createTestGroup()
    await createTestUserGroup(testUser.id, group.id, UGRO.MEMBER, false)
  })

  afterEach(onAfterEach)

  it('removes the sponsorships the leaving member funded from the group', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ removed: 2 }) })

    const result = await doQuery(leaveGroup, { groupId: group.id })

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      `${managerApiUrl}/api/project-sponsorships/by-sponsor?userId=${testUser.id}&proGroupId=${group.id}`,
      expect.objectContaining({ method: 'DELETE' })
    )
    const userGroup = await testEntityManager.findOne(UserGroupModel, { userId: testUser.id, groupId: group.id })
    expect(userGroup).toBeUndefined()
  })

  it('still leaves the group when the manager service is unreachable', async() => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await doQuery(leaveGroup, { groupId: group.id })

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/project-sponsorships/by-sponsor?'),
      expect.objectContaining({ method: 'DELETE' })
    )
    const userGroup = await testEntityManager.findOne(UserGroupModel, { userId: testUser.id, groupId: group.id })
    expect(userGroup).toBeUndefined()
  })

  it('skips the manager service when manager_api_url is not configured', async() => {
    config.manager_api_url = ''
    try {
      const result = await doQuery(leaveGroup, { groupId: group.id })

      expect(result).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
      const userGroup = await testEntityManager.findOne(UserGroupModel, { userId: testUser.id, groupId: group.id })
      expect(userGroup).toBeUndefined()
    } finally {
      config.manager_api_url = managerApiUrl
    }
  })
})
