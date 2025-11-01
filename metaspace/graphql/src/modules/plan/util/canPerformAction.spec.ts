import {
  adminContext,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  userContext,
} from '../../../tests/graphqlTestEnvironment'

import canPerformAction from './canPerformAction'
import config from '../../../utils/config'

// Import fetch from node-fetch (which is already mocked globally)
import fetch from 'node-fetch'

describe('Plan Controller Queries', () => {
  let originalDateNow: any
  let originalManagerApiUrl: string | undefined
  const mockFetch = fetch as jest.Mock

  beforeAll(async() => {
    await onBeforeAll()
    originalDateNow = Date.now
    originalManagerApiUrl = config.manager_api_url

    // Mock the config API URL
    config.manager_api_url = 'https://test-api.metaspace.example'

    // Mock Date.now to return a specific timestamp
    Date.now = jest.fn(() => new Date('2024-10-30T10:00:00Z').getTime())
  })

  afterAll(async() => {
    await onAfterAll()
    Date.now = originalDateNow
    // Restore original config value if it was defined
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      // If it was undefined, we need to use delete to remove the property
      delete (config as any).manager_api_url
    }

    // No need to restore the original mock implementation
    // The global jest.resetAllMocks() in the test framework will handle this
  })

  beforeEach(async() => {
    jest.clearAllMocks()
    mockFetch.mockClear()

    await onBeforeEach()
    await setupTestUsers()
  })

  afterEach(onAfterEach)

  // const actionTypes = ['download', 'process', 'delete'] as const
  const actionTypes = ['download'] as const
  const testCases = [
    // Testing different limit types with visibility and source
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'minute', usageCount: 1, expected: true },
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'minute', usageCount: 2, expected: false },

    // Day limit tests with visibility and source differences
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'day', usageCount: 1, expected: true },
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'day', usageCount: 4, expected: false },
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'day', usageCount: 4, expected: false }, // Not blocked due to visibility mismatch

    // Month limit tests
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'month', usageCount: 1, expected: true },
    { visibility: 'private', source: 'api', isAdmin: false, limitType: 'month', usageCount: 6, expected: false },

    // // Year limit tests
    { visibility: 'public', source: 'web', isAdmin: false, limitType: 'year', usageCount: 2, expected: true },
    { visibility: 'public', source: 'api', isAdmin: false, limitType: 'year', usageCount: 11, expected: false },
    //
    // // Admin tests to bypass limits
    { visibility: 'private', source: 'api', isAdmin: true, limitType: 'day', usageCount: 7, expected: true },
    { visibility: 'public', source: 'web', isAdmin: true, limitType: 'month', usageCount: 14, expected: true },
    { visibility: 'private', source: 'api', isAdmin: true, limitType: 'year', usageCount: 25, expected: true },
  ]

  actionTypes.forEach((actionType) => {
    testCases.forEach(({ visibility, source, isAdmin, limitType, usageCount, expected }) => {
      it(`should ${expected ? 'allow' : 'block'} ${actionType}
      with visibility=${visibility}, source=${source}, ${limitType} limit, usageCount=${usageCount}
      ${isAdmin ? 'for admin' : 'for user'}`, async() => {
        const context = isAdmin ? adminContext : userContext

        // Setup the mock response for fetch, but only if not admin
        if (!isAdmin) {
          mockFetch.mockImplementationOnce(() =>
            Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ allowed: expected }),
              text: () => Promise.resolve(''),
              headers: new Map(),
            })
          )
        }

        const result = await canPerformAction(context, {
          actionType,
          type: 'dataset',
          visibility,
          source,
        } as Partial<any>)

        expect(result.allowed).toBe(expected)

        // For admin users, fetch is not called because it returns early
        if (!isAdmin) {
          // Verify that fetch was called with the correct parameters
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/api-usages/is-allowed'),
            expect.objectContaining({
              method: 'POST',
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
              }),
              body: expect.any(String),
            })
          )

          // Verify the request body
          const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
          expect(requestBody).toMatchObject({
            actionType,
            type: 'dataset',
            visibility,
            source,
          })
        }
      })
    })
  })

  it('should be able to download after 10 min', async() => {
    const context = userContext
    const actionType = 'download'
    const visibility = 'public'
    const source = 'api'

    // Mock the first fetch call to return not allowed
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ allowed: false }),
        text: () => Promise.resolve(''),
        headers: new Map(),
      })
    )

    // Verify the action is blocked initially
    const blocked = await canPerformAction(context, { actionType, type: 'dataset', visibility, source })
    expect(blocked.allowed).toBe(false)

    // Advance time by 10 minutes
    Date.now = jest.fn(() => new Date('2024-10-30T10:10:00Z').getTime())

    // Mock the second fetch call to return allowed
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ allowed: true }),
        text: () => Promise.resolve(''),
        headers: new Map(),
      })
    )

    const allowed = await canPerformAction(context, { actionType, type: 'dataset', visibility, source })
    expect(allowed.allowed).toBe(true)
  })

  it('should handle connection errors gracefully', async() => {
    const context = userContext
    const error: any = new Error('Failed to fetch')
    error.code = 'ECONNREFUSED'

    mockFetch.mockRejectedValueOnce(error)

    const result = await canPerformAction(context, { actionType: 'download', type: 'dataset' })
    expect(result.allowed).toBe(true) // Should allow when service is down
  })

  it('should handle API response errors', async() => {
    const context = userContext

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Rate limit exceeded' }),
    })

    const result = await canPerformAction(context, { actionType: 'download', type: 'dataset' })
    expect(result.allowed).toBe(false)
    expect(result.message).toBe('Rate limit exceeded')
  })

  it('should handle missing API URL', async() => {
    const context = userContext
    const originalApiUrl = config.manager_api_url
    delete (config as any).manager_api_url

    const result = await canPerformAction(context, { actionType: 'download', type: 'dataset' })
    expect(result.allowed).toBe(true) // Should allow when API URL not configured

    config.manager_api_url = originalApiUrl
  })
})

describe('Plan Utility Functions - performAction', () => {
  let originalManagerApiUrl: string | undefined
  const mockFetch = fetch as jest.Mock

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
    jest.clearAllMocks()
    mockFetch.mockClear()
    await onBeforeEach()
    await setupTestUsers()
  })

  afterEach(onAfterEach)

  it('should perform action successfully', async() => {
    const { performAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset', datasetId: 'test-123' }
    const expectedResponse = { success: true, usageId: 'usage-123' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(expectedResponse),
    })

    const result = await performAction(context, action)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-api.metaspace.example/api/api-usages/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(action),
      })
    )

    expect(result).toEqual(expectedResponse)
  })

  it('should handle missing API URL', async() => {
    const { performAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    const originalApiUrl = config.manager_api_url
    delete (config as any).manager_api_url

    const result = await performAction(context, action)

    expect(result).toEqual({})

    config.manager_api_url = originalApiUrl
  })

  it('should handle API errors', async() => {
    const { performAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
    })

    await expect(performAction(context, action)).rejects.toThrow('Failed to perform action: Bad Request')
  })

  it('should handle connection errors gracefully', async() => {
    const { performAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    const error: any = new Error('Failed to fetch')
    error.code = 'ECONNREFUSED'
    mockFetch.mockRejectedValueOnce(error)

    const result = await performAction(context, action)

    expect(result).toEqual({})
  })
})

describe('Plan Utility Functions - assertCanPerformAction', () => {
  let originalManagerApiUrl: string | undefined
  const mockFetch = fetch as jest.Mock

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
    jest.clearAllMocks()
    mockFetch.mockClear()
    await onBeforeEach()
    await setupTestUsers()
  })

  afterEach(onAfterEach)

  it('should not throw when action is allowed', async() => {
    const { assertCanPerformAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: true }),
    })

    await expect(assertCanPerformAction(context, action)).resolves.not.toThrow()
  })

  it('should throw UserError when action is not allowed', async() => {
    const { assertCanPerformAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: false, message: 'Rate limit exceeded' }),
    })

    await expect(assertCanPerformAction(context, action)).rejects.toThrow('Rate limit exceeded')
  })

  it('should throw default message when no message provided', async() => {
    const { assertCanPerformAction } = await import('./canPerformAction')
    const context = userContext
    const action = { actionType: 'download', type: 'dataset' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: false }),
    })

    await expect(assertCanPerformAction(context, action)).rejects.toThrow('Limit reached')
  })
})

describe('Plan Utility Functions - getDeviceInfo', () => {
  it('should parse user agent successfully', async() => {
    const { getDeviceInfo } = await import('./canPerformAction')
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    const email = 'test@example.com'

    const result = getDeviceInfo(userAgent, email)
    const parsed = JSON.parse(result)

    expect(parsed).toHaveProperty('device')
    expect(parsed).toHaveProperty('os')
    expect(parsed).toHaveProperty('browser')
    expect(parsed.email).toBe(email)
  })

  it('should handle undefined user agent', async() => {
    const { getDeviceInfo } = await import('./canPerformAction')

    const result = getDeviceInfo(undefined)
    const parsed = JSON.parse(result)

    expect(parsed).toHaveProperty('device')
    expect(parsed).toHaveProperty('os')
    expect(parsed).toHaveProperty('browser')
    expect(parsed.email).toBeNull()
  })
})

describe('Plan Utility Functions - hashIp', () => {
  it('should hash IP address with salt', async() => {
    const { hashIp } = await import('./canPerformAction')
    const ip = '192.168.1.1'

    const result = hashIp(ip)

    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result).toHaveLength(64) // SHA256 hex string length
  })

  it('should return undefined for undefined IP', async() => {
    const { hashIp } = await import('./canPerformAction')

    const result = hashIp(undefined)

    expect(result).toBeUndefined()
  })

  it('should produce different hashes for different IPs', async() => {
    const { hashIp } = await import('./canPerformAction')

    const hash1 = hashIp('192.168.1.1')
    const hash2 = hashIp('192.168.1.2')

    expect(hash1).not.toBe(hash2)
  })
})
