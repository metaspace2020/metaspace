import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testUser,
  adminUser,
  adminContext,
  anonContext,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/featureRequest/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined

  const FEATURE_REQUESTS = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Add dark mode support',
      description: 'It would be great to have a dark mode option for the application.',
      status: 'under_review',
      userId: '', // Will be set to testUser.id after setup
      adminNotes: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      displayOrder: 0,
      isVisible: true,
      likes: 0,
      hasVoted: false,
      createdAt: currentTime,
      updatedAt: currentTime,
      deletedAt: null,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Export data as CSV',
      description: 'Allow users to export their data in CSV format.',
      status: 'approved',
      userId: '', // Will be set to testUser.id after setup
      adminNotes: 'Great idea! Adding to roadmap.',
      approvedBy: '', // Will be set to adminUser.id after setup
      approvedAt: currentTime,
      rejectedBy: null,
      rejectedAt: null,
      displayOrder: 1,
      isVisible: true,
      likes: 5,
      hasVoted: false,
      createdAt: currentTime,
      updatedAt: currentTime,
      deletedAt: null,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      title: 'Add mobile app',
      description: 'Create a mobile version of the application.',
      status: 'rejected',
      userId: '', // Will be set to adminUser.id after setup
      adminNotes: 'Out of scope for now',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: '', // Will be set to adminUser.id after setup
      rejectedAt: currentTime,
      displayOrder: 2,
      isVisible: false,
      likes: 2,
      hasVoted: false,
      createdAt: currentTime,
      updatedAt: currentTime,
      deletedAt: null,
    },
  ]

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

    // Set up user IDs in test data
    FEATURE_REQUESTS[0].userId = testUser.id
    FEATURE_REQUESTS[1].userId = testUser.id
    FEATURE_REQUESTS[1].approvedBy = adminUser.id
    FEATURE_REQUESTS[2].userId = adminUser.id
    FEATURE_REQUESTS[2].rejectedBy = adminUser.id

    mockFetch.mockClear()
  })

  afterEach(async() => {
    await onAfterEach()
  })

  describe('Query.myFeatureRequests', () => {
    const queryMyFeatureRequests = `query {
      myFeatureRequests {
        id
        title
        description
        status
        createdAt
      }
    }`

    it('should return current user\'s feature requests', async() => {
      const userFeatureRequests = FEATURE_REQUESTS.filter(fr => fr.userId === testUser.id)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: userFeatureRequests,
        }),
      })

      const result = await doQuery(queryMyFeatureRequests)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/feature-requests/my-requests',
        expect.any(Object)
      )

      expect(result).toHaveLength(userFeatureRequests.length)
      expect(result[0].title).toBe(userFeatureRequests[0].title)
    })

    it('should require authentication', async() => {
      await expect(
        doQuery(queryMyFeatureRequests, null, { context: anonContext })
      ).rejects.toThrow('Authentication required')
    })
  })

  describe('Query.publicFeatureRequests', () => {
    const queryPublicFeatureRequests = `query {
      publicFeatureRequests {
        id
        title
        description
        status
        likes
        hasVoted
        createdAt
      }
    }`

    it('should return public feature requests', async() => {
      const publicRequests = [FEATURE_REQUESTS[1]] // Only approved and visible

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: publicRequests,
        }),
      })

      const result = await doQuery(queryPublicFeatureRequests)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/feature-requests/public',
        expect.any(Object)
      )

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe(FEATURE_REQUESTS[1].title)
    })
  })

  describe('Query.featureRequest', () => {
    const queryFeatureRequest = `query($id: ID!) {
      featureRequest(id: $id) {
        id
        title
        description
        status
      }
    }`

    it('should return a specific feature request for admin', async() => {
      const featureRequest = FEATURE_REQUESTS[0]

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: featureRequest,
        }),
      })

      const result = await doQuery(
        queryFeatureRequest,
        { id: featureRequest.id },
        { context: adminContext }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/feature-requests/${featureRequest.id}`,
        expect.any(Object)
      )

      expect(result.id).toBe(featureRequest.id)
      expect(result.title).toBe(featureRequest.title)
    })

    it('should deny access to non-admin users', async() => {
      await expect(
        doQuery(
          queryFeatureRequest,
          { id: FEATURE_REQUESTS[0].id }
        )
      ).rejects.toThrow('Access denied: Admin role required')
    })
  })

  describe('Query.allFeatureRequests', () => {
    const queryAllFeatureRequests = `query {
      allFeatureRequests(limit: 20, offset: 0) {
        id
        title
        status
      }
    }`

    it('should return all feature requests for admin', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: FEATURE_REQUESTS,
          meta: {
            total: FEATURE_REQUESTS.length,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        }),
      })

      const result = await doQuery(queryAllFeatureRequests, null, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feature-requests'),
        expect.any(Object)
      )

      expect(result).toHaveLength(FEATURE_REQUESTS.length)
    })

    it('should deny access to non-admin users', async() => {
      await expect(
        doQuery(queryAllFeatureRequests)
      ).rejects.toThrow('Access denied: Admin role required')
    })
  })

  describe('Query.featureRequestsCount', () => {
    const queryFeatureRequestsCount = `query {
      featureRequestsCount
    }`

    it('should return count of feature requests for admin', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: FEATURE_REQUESTS,
          meta: {
            total: FEATURE_REQUESTS.length,
          },
        }),
      })

      const result = await doQuery(queryFeatureRequestsCount, null, { context: adminContext })

      expect(result).toBe(FEATURE_REQUESTS.length)
    })

    it('should deny access to non-admin users', async() => {
      await expect(
        doQuery(queryFeatureRequestsCount)
      ).rejects.toThrow('Access denied: Admin role required')
    })
  })
})
