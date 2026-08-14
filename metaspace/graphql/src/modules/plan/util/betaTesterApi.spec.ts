import fetch from 'node-fetch'
import config from '../../../utils/config'
import { activateBetaTesterToken, fetchBetaFeatures } from './betaTesterApi'

jest.mock('node-fetch')
const mockFetch = fetch as unknown as jest.Mock

describe('modules/plan/util/betaTesterApi', () => {
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

  describe('fetchBetaFeatures', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440099'

    it('should return the features array from the manager service', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ allowed: true, features: ['diffAnalysis', 'segmentation'] }),
      })

      const result = await fetchBetaFeatures(userId)

      expect(result).toEqual(['diffAnalysis', 'segmentation'])
      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/beta-testers/is-allowed?userId=${userId}`,
        expect.objectContaining({ timeout: expect.any(Number) })
      )
    })

    it('should return an empty list when the user has no valid records', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ allowed: false, features: [] }),
      })

      expect(await fetchBetaFeatures(userId)).toEqual([])
    })

    it('should return an empty list on a non-OK response', async() => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({}) })

      expect(await fetchBetaFeatures(userId)).toEqual([])
    })

    it('should return an empty list when the request fails', async() => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      expect(await fetchBetaFeatures(userId)).toEqual([])
    })

    it('should return an empty list when the response has no features array', async() => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ allowed: true }) })

      expect(await fetchBetaFeatures(userId)).toEqual([])
    })

    it('should return an empty list without calling the API when the URL is not configured', async() => {
      const url = config.manager_api_url
      delete (config as any).manager_api_url
      try {
        expect(await fetchBetaFeatures(userId)).toEqual([])
        expect(mockFetch).not.toHaveBeenCalled()
      } finally {
        config.manager_api_url = url
      }
    })
  })

  describe('activateBetaTesterToken', () => {
    const token = 'a1b2c3d4-0000-0000-0000-000000000000'

    const redirectResponse = (location: string | null) => ({
      status: 302,
      headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
    })

    it('should return success when the manager redirects with betaActivation=success', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=success')
      )

      const result = await activateBetaTesterToken(token)

      expect(result).toEqual('success')
      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/beta-testers/activate/${token}`,
        expect.objectContaining({ redirect: 'manual', timeout: expect.any(Number) })
      )
    })

    it('should return already-active on a repeat activation', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=already-active')
      )

      expect(await activateBetaTesterToken(token)).toEqual('already-active')
    })

    it('should return invalid for an unknown token', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=invalid')
      )

      expect(await activateBetaTesterToken(token)).toEqual('invalid')
    })

    it('should forward override params as query string', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=success')
      )

      await activateBetaTesterToken(token, {
        features: 'diffAnalysis,segmentation',
        startDate: '2026-08-04T00:00:00.000Z',
      })

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain(`/api/beta-testers/activate/${token}?`)
      expect(calledUrl).toContain('features=diffAnalysis%2Csegmentation')
      expect(calledUrl).toContain('startDate=2026-08-04T00%3A00%3A00.000Z')
      expect(calledUrl).not.toContain('endDate')
    })

    it('should return invalid on a non-redirect response', async() => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        headers: { get: () => null },
      })

      expect(await activateBetaTesterToken(token)).toEqual('invalid')
    })

    it('should return invalid when the redirect has no betaActivation param', async() => {
      mockFetch.mockResolvedValueOnce(redirectResponse('http://localhost:8999/'))

      expect(await activateBetaTesterToken(token)).toEqual('invalid')
    })

    it('should return invalid when the request fails', async() => {
      mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'))

      expect(await activateBetaTesterToken(token)).toEqual('invalid')
    })

    it('should return invalid without calling the API when the URL is not configured', async() => {
      const url = config.manager_api_url
      delete (config as any).manager_api_url
      try {
        expect(await activateBetaTesterToken(token)).toEqual('invalid')
        expect(mockFetch).not.toHaveBeenCalled()
      } finally {
        config.manager_api_url = url
      }
    })
  })
})
