import fetch from 'node-fetch'
import config from '../../utils/config'
import {
  getProjectSponsorship,
  putProjectSponsorship,
  deleteProjectSponsorship,
  deleteSponsorshipsBySponsor,
  groupHasActiveSubscription,
  ManagerApiHttpError,
} from './managerApi'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

describe('projectSponsorship/managerApi', () => {
  const base = 'https://test-api.metaspace.example'
  const ctx = { req: { headers: { authorization: 'Bearer t' } } } as any
  const record = {
    id: 's1',
    projectId: 'p1',
    proGroupId: 'g1',
    sponsorUserId: 'u1',
    entitlements: ['experiments'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  }
  let originalUrl: string | undefined

  beforeAll(() => {
    originalUrl = config.manager_api_url
    config.manager_api_url = base
  })

  afterAll(() => {
    if (originalUrl !== undefined) {
      config.manager_api_url = originalUrl
    } else {
      delete (config as any).manager_api_url
    }
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getProjectSponsorship returns null on 404', async() => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve(({})) })
    expect(await getProjectSponsorship(ctx, 'p1')).toBeNull()
  })

  it('getProjectSponsorship returns the record on 200', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(record) })
    expect(await getProjectSponsorship(ctx, 'p1')).toEqual(record)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${base}/api/project-sponsorships/project/p1`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer t')
  })

  it('getProjectSponsorship throws on other non-2xx', async() => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Boom', json: () => Promise.resolve(({})) })
    await expect(getProjectSponsorship(ctx, 'p1')).rejects.toThrow(/Boom/)
  })

  it('putProjectSponsorship sends proGroupId and entitlements and returns the record', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(record) })
    expect(await putProjectSponsorship(ctx, 'p1', 'g1', ['experiments'])).toEqual(record)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${base}/api/project-sponsorships/project/p1`)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(init.body)).toEqual({ proGroupId: 'g1', entitlements: ['experiments'] })
  })

  it('putProjectSponsorship throws the body message on 400', async() => {
    mockFetch.mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request', json: () => Promise.resolve(({ message: 'bad' })),
    })
    await expect(putProjectSponsorship(ctx, 'p1', 'g1', [])).rejects.toThrow(/bad/)
    await expect(putProjectSponsorship(ctx, 'p1', 'g1', [])).rejects.toBeInstanceOf(ManagerApiHttpError)
  })

  it('putProjectSponsorship passes a network error through, not as ManagerApiHttpError', async() => {
    mockFetch.mockRejectedValue(new Error('network'))
    const error = await putProjectSponsorship(ctx, 'p1', 'g1', []).catch(e => e)
    expect(error.message).toBe('network')
    expect(error).not.toBeInstanceOf(ManagerApiHttpError)
  })

  it('deleteProjectSponsorship returns true on 404', async() => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve(({})) })
    expect(await deleteProjectSponsorship(ctx, 'p1')).toBe(true)
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('deleteProjectSponsorship throws on other failures', async() => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Boom', json: () => Promise.resolve(({})) })
    await expect(deleteProjectSponsorship(ctx, 'p1')).rejects.toThrow(/Boom/)
  })

  it('deleteSponsorshipsBySponsor returns removed count', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(({ removed: 3 })) })
    expect(await deleteSponsorshipsBySponsor(ctx, 'u1', 'g1')).toBe(3)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${base}/api/project-sponsorships/by-sponsor?userId=u1&proGroupId=g1`)
    expect(init.method).toBe('DELETE')
  })

  it('deleteSponsorshipsBySponsor returns 0 and does not throw when fetch rejects', async() => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await deleteSponsorshipsBySponsor(ctx, 'u1', 'g1')).toBe(0)
  })

  it('groupHasActiveSubscription is true for a 2xx with a subscription body', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(({ id: 'sub1' })) })
    expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${base}/api/subscriptions/group/g1/active`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer t')
  })

  it('groupHasActiveSubscription accepts a { data } envelope', async() => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(({ data: { id: 'sub1' } })) })
    expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(true)
  })

  it.each([
    ['null body', () => Promise.resolve(null)],
    ['empty object', () => Promise.resolve({})],
    ['empty data envelope', () => Promise.resolve({ data: null })],
    ['non-JSON body', () => Promise.reject(new Error('Unexpected end of JSON input'))],
  ])('groupHasActiveSubscription is false for a 2xx with %s', async(_, json) => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json })
    expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(false)
  })

  it('groupHasActiveSubscription is false on non-2xx', async() => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve(({ id: 'x' })) })
    expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(false)
  })

  it('groupHasActiveSubscription is false and does not throw when fetch rejects', async() => {
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(false)
  })

  describe('when manager_api_url is unset', () => {
    beforeEach(() => {
      delete (config as any).manager_api_url
    })
    afterEach(() => {
      config.manager_api_url = base
    })

    it('getProjectSponsorship returns null', async() => {
      expect(await getProjectSponsorship(ctx, 'p1')).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('groupHasActiveSubscription returns false without fetching', async() => {
      expect(await groupHasActiveSubscription(ctx, 'g1')).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('deleteSponsorshipsBySponsor returns 0', async() => {
      expect(await deleteSponsorshipsBySponsor(ctx, 'u1', 'g1')).toBe(0)
    })

    it('put and delete throw', async() => {
      await expect(putProjectSponsorship(ctx, 'p1', 'g1', [])).rejects.toThrow('Pro sponsorship is not available')
      await expect(deleteProjectSponsorship(ctx, 'p1')).rejects.toThrow('Pro sponsorship is not available')
    })
  })
})
