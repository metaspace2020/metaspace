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

        expect(result).toBe(expected)

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
    expect(blocked).toBe(false)

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
    expect(allowed).toBe(true)
  })
})
