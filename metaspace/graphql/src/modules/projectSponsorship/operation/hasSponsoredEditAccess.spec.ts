import {
  onAfterAll, onAfterEach, onBeforeAll, onBeforeEach, setupTestUsers, testEntityManager, testUser,
} from '../../../tests/graphqlTestEnvironment'
import { createTestProject, createTestUserProject } from '../../../tests/testDataCreation'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { getContextForTest } from '../../../getContext'
import fetch from 'node-fetch'
import config from '../../../utils/config'
import { hasSponsoredEditAccess } from './hasSponsoredEditAccess'

jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

const jsonResponse = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: () => Promise.resolve(body),
})

const OWNER = 'owner-user-id'
const OTHER = 'other-user-id'

const sponsorship = (projectId: string, sponsorUserId: string, entitlements = ['private_resubmission']) => ({
  id: 'sp-' + projectId,
  projectId,
  proGroupId: 'pro-group',
  sponsorUserId,
  entitlements,
  isActive: true,
  createdAt: new Date().toISOString(),
})

describe('hasSponsoredEditAccess', () => {
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

  const newCtx = () => getContextForTest(testUser as any, testEntityManager)
  const memberOf = async(role = UPRO.MEMBER) => {
    const project = await createTestProject({ isPublic: false })
    await createTestUserProject(testUser.id, project.id, role)
    return project
  }
  const respondByProject = (byProject: Record<string, any>) => {
    mockFetch.mockImplementation((url: string) => {
      const id = Object.keys(byProject).find(p => url.endsWith(`/project/${p}`))
      return Promise.resolve(id != null ? byProject[id] : jsonResponse(404))
    })
  }

  it('grants when the user is a member, the sponsorship has private_resubmission and the sponsor owns the dataset',
    async() => {
      const p = await memberOf()
      respondByProject({ [p.id]: jsonResponse(200, sponsorship(p.id, OWNER)) })
      expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(true)
    })

  it('grants when only the second of two projects qualifies', async() => {
    const p1 = await memberOf()
    const p2 = await memberOf(UPRO.MANAGER)
    respondByProject({
      [p1.id]: jsonResponse(200, sponsorship(p1.id, OTHER)),
      [p2.id]: jsonResponse(200, sponsorship(p2.id, OWNER)),
    })
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p1.id, p2.id])).toBe(true)
  })

  it('denies when the sponsor is not the dataset owner', async() => {
    const p = await memberOf()
    respondByProject({ [p.id]: jsonResponse(200, sponsorship(p.id, OTHER)) })
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
  })

  it('denies when the entitlement list lacks private_resubmission', async() => {
    const p = await memberOf()
    respondByProject({
      [p.id]: jsonResponse(200, sponsorship(p.id, OWNER, ['private_submission', 'segmentation'])),
    })
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
  })

  it('denies and does not call the manager when the user is not MEMBER or MANAGER of any candidate project',
    async() => {
      const p = await memberOf(UPRO.REVIEWER)
      respondByProject({ [p.id]: jsonResponse(200, sponsorship(p.id, OWNER)) })
      expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

  it('denies when the manager answers 404', async() => {
    const p = await memberOf()
    mockFetch.mockResolvedValue(jsonResponse(404, { message: 'Not found' }))
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
  })

  it('denies when the manager answers 500 or the request rejects', async() => {
    const p = await memberOf()
    mockFetch.mockResolvedValue(jsonResponse(500, { message: 'boom' }))
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
    mockFetch.mockRejectedValue(new Error('network down'))
    expect(await hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).toBe(false)
  })

  it('fetches each project once per context', async() => {
    const p = await memberOf()
    respondByProject({ [p.id]: jsonResponse(200, sponsorship(p.id, OWNER)) })
    const ctx = newCtx()
    expect(await hasSponsoredEditAccess(ctx, OWNER, [p.id])).toBe(true)
    expect(await hasSponsoredEditAccess(ctx, OWNER, [p.id])).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('denies without throwing when a 200 body has no entitlements', async() => {
    const p = await memberOf()
    const noEntitlements: any = sponsorship(p.id, OWNER)
    delete noEntitlements.entitlements
    respondByProject({ [p.id]: jsonResponse(200, noEntitlements) })
    await expect(hasSponsoredEditAccess(newCtx(), OWNER, [p.id])).resolves.toBe(false)
  })

  it('denies and does not call the manager when the dataset has no submitter id', async() => {
    const p = await memberOf()
    respondByProject({ [p.id]: jsonResponse(200, sponsorship(p.id, null as any)) })
    expect(await hasSponsoredEditAccess(newCtx(), null as any, [p.id])).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
