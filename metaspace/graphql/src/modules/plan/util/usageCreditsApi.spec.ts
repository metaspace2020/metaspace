import fetch from 'node-fetch'
import config from '../../../utils/config'
import { consumeUsageCredit } from './usageCreditsApi'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

describe('modules/plan/util/usageCreditsApi', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440099'
  let originalManagerApiUrl: string | undefined

  beforeAll(() => {
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(() => {
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      delete (config as any).manager_api_url
    }
  })

  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('should return true when the manager confirms the credit was consumed', async() => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ consumed: true, grantId: 'g1', remaining: 4, expiresAt: null }),
    })

    const result = await consumeUsageCredit(userId, 'download', 'dataset')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-api.metaspace.example/api/usage-credits/consume',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, actionType: 'download', type: 'dataset' }),
        timeout: expect.any(Number),
      })
    )
  })

  it('should return false on a 403 (no credits available)', async() => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'No usage credits available' }),
    })

    expect(await consumeUsageCredit(userId, 'download', 'dataset')).toBe(false)
  })

  it('should return false on an unexpected non-OK status', async() => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })

    expect(await consumeUsageCredit(userId, 'download', 'dataset')).toBe(false)
  })

  it('should return false when the body does not confirm consumption', async() => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })

    expect(await consumeUsageCredit(userId, 'download', 'dataset')).toBe(false)
  })

  it('should return false when the request fails', async() => {
    mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    expect(await consumeUsageCredit(userId, 'download', 'dataset')).toBe(false)
  })

  it('should return false without calling the API when the URL is not configured', async() => {
    const url = config.manager_api_url
    delete (config as any).manager_api_url
    try {
      expect(await consumeUsageCredit(userId, 'download', 'dataset')).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      config.manager_api_url = url
    }
  })
})
