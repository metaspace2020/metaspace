import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  anonContext,
} from '../../../tests/graphqlTestEnvironment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/plan/controller (mutations)', () => {
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
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
    mockFetch.mockClear()
  })

  afterEach(async() => {
    await onAfterEach()
  })

  describe('Mutation.activateBetaTester', () => {
    const activateMutation = `mutation ($token: String!, $features: String, $startDate: String, $endDate: String) {
      activateBetaTester(token: $token, features: $features, startDate: $startDate, endDate: $endDate)
    }`
    const token = 'a1b2c3d4-0000-0000-0000-000000000000'

    const redirectResponse = (location: string) => ({
      status: 302,
      headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
    })

    it('should activate a token for an anonymous user', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=success')
      )

      const result = await doQuery(activateMutation, { token }, { context: anonContext })

      expect(result).toEqual('success')
      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/beta-testers/activate/${token}`,
        expect.objectContaining({ redirect: 'manual' })
      )
    })

    it('should report an already active token', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=already-active')
      )

      const result = await doQuery(activateMutation, { token }, { context: anonContext })

      expect(result).toEqual('already-active')
    })

    it('should report an invalid token', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=invalid')
      )

      const result = await doQuery(activateMutation, { token }, { context: anonContext })

      expect(result).toEqual('invalid')
    })

    it('should forward override params to the manager service', async() => {
      mockFetch.mockResolvedValueOnce(
        redirectResponse('http://localhost:8999/?betaActivation=success')
      )

      await doQuery(activateMutation, {
        token,
        features: 'experiments',
        startDate: '2026-08-04T00:00:00.000Z',
      }, { context: anonContext })

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('features=experiments')
      expect(calledUrl).toContain('startDate=2026-08-04T00%3A00%3A00.000Z')
      expect(calledUrl).not.toContain('endDate')
    })

    it('should report invalid when the manager service is down', async() => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await doQuery(activateMutation, { token }, { context: anonContext })

      expect(result).toEqual('invalid')
    })
  })
})
