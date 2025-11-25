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

describe('modules/featureRequest/controller (mutations)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
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

  const createFeatureRequestMutation = `mutation($input: CreateFeatureRequestInput!) {
    createFeatureRequest(input: $input) {
      id
      title
      description
      status
      userId
      createdAt
    }
  }`

  const approveFeatureRequestMutation = `mutation($id: ID!, $input: ApproveFeatureRequestInput) {
    approveFeatureRequest(id: $id, input: $input) {
      id
      status
      approvedBy
      approvedAt
      adminNotes
    }
  }`

  const rejectFeatureRequestMutation = `mutation($id: ID!, $input: RejectFeatureRequestInput!) {
    rejectFeatureRequest(id: $id, input: $input) {
      id
      status
      rejectedBy
      rejectedAt
      adminNotes
    }
  }`

  const deleteFeatureRequestMutation = `mutation($id: ID!) {
    deleteFeatureRequest(id: $id)
  }`

  describe('Mutation.createFeatureRequest', () => {
    it('should create a new feature request', async() => {
      const input = {
        title: 'Add dark mode support',
        description: 'It would be great to have a dark mode option for the application.',
      }

      const expectedResponse = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          title: input.title,
          description: input.description,
          status: 'under_review',
          userId: testUser.id,
          displayOrder: 0,
          isVisible: true,
          likes: 0,
          hasVoted: false,
          createdAt: currentTime,
          updatedAt: currentTime,
        },
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(expectedResponse),
      })

      const result = await doQuery(
        createFeatureRequestMutation,
        { input }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/feature-requests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        })
      )

      expect(result.title).toBe(input.title)
      expect(result.description).toBe(input.description)
      expect(result.status).toBe('under_review')
    })

    it('should require authentication', async() => {
      const input = {
        title: 'Test Feature',
        description: 'Test description',
      }

      await expect(
        doQuery(createFeatureRequestMutation, { input }, { context: anonContext })
      ).rejects.toThrow('Authentication required')
    })

    it('should validate required fields', async() => {
      const input = {
        title: '',
        description: 'Test description',
      }

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow()
    })

    it('should handle empty description', async() => {
      const input = {
        title: 'Test Feature',
        description: '',
      }

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow()
    })

    it('should handle whitespace-only title', async() => {
      const input = {
        title: '   ',
        description: 'Test description',
      }

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow()
    })

    it('should handle whitespace-only description', async() => {
      const input = {
        title: 'Test Feature',
        description: '   ',
      }

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow()
    })

    it('should handle API errors', async() => {
      const input = {
        title: 'Test Feature',
        description: 'Test description',
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      })

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow()
    })

    it('should handle network errors', async() => {
      const input = {
        title: 'Test Feature',
        description: 'Test description',
      }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        doQuery(createFeatureRequestMutation, { input })
      ).rejects.toThrow('Failed to create feature request')
    })
  })

  describe('Mutation.approveFeatureRequest', () => {
    it('should approve a feature request', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = {
        adminNotes: 'Great idea! Adding to roadmap.',
      }

      const expectedResponse = {
        data: {
          id: featureRequestId,
          status: 'approved',
          approvedBy: adminUser.id,
          approvedAt: currentTime,
          adminNotes: input.adminNotes,
        },
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(expectedResponse),
      })

      const result = await doQuery(
        approveFeatureRequestMutation,
        { id: featureRequestId, input },
        { context: adminContext }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/feature-requests/${featureRequestId}/approve`,
        expect.objectContaining({
          method: 'PUT',
        })
      )

      expect(result.status).toBe('approved')
      expect(result.adminNotes).toBe(input.adminNotes)
    })

    it('should deny access to non-admin users', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = {
        adminNotes: 'Test notes',
      }

      await expect(
        doQuery(
          approveFeatureRequestMutation,
          { id: featureRequestId, input }
        )
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should handle approve without adminNotes', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'

      const expectedResponse = {
        data: {
          id: featureRequestId,
          status: 'approved',
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(expectedResponse),
      })

      const result = await doQuery(
        approveFeatureRequestMutation,
        { id: featureRequestId },
        { context: adminContext }
      )

      expect(result.id).toBe(featureRequestId)
    })

    it('should handle response without data field', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = { adminNotes: 'Approved' }

      const expectedResponse = {
        id: featureRequestId,
        status: 'approved',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(expectedResponse),
      })

      const result = await doQuery(
        approveFeatureRequestMutation,
        { id: featureRequestId, input },
        { context: adminContext }
      )

      expect(result.id).toBe(featureRequestId)
    })

    it('should handle API error', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'

      mockFetch.mockRejectedValueOnce(new Error('API error'))

      await expect(
        doQuery(
          approveFeatureRequestMutation,
          { id: featureRequestId },
          { context: adminContext }
        )
      ).rejects.toThrow('Failed to approve feature request')
    })
  })

  describe('Mutation.rejectFeatureRequest', () => {
    it('should reject a feature request with reason', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = {
        adminNotes: 'This feature is out of scope for our current roadmap.',
      }

      const expectedResponse = {
        data: {
          id: featureRequestId,
          status: 'rejected',
          rejectedBy: adminUser.id,
          rejectedAt: currentTime,
          adminNotes: input.adminNotes,
        },
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(expectedResponse),
      })

      const result = await doQuery(
        rejectFeatureRequestMutation,
        { id: featureRequestId, input },
        { context: adminContext }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/feature-requests/${featureRequestId}/reject`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(input),
        })
      )

      expect(result.status).toBe('rejected')
      expect(result.adminNotes).toBe(input.adminNotes)
    })

    it('should require adminNotes when rejecting', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = {
        adminNotes: '',
      }

      await expect(
        doQuery(
          rejectFeatureRequestMutation,
          { id: featureRequestId, input },
          { context: adminContext }
        )
      ).rejects.toThrow()
    })

    it('should deny access to non-admin users', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = {
        adminNotes: 'Test rejection',
      }

      await expect(
        doQuery(
          rejectFeatureRequestMutation,
          { id: featureRequestId, input }
        )
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should handle whitespace-only adminNotes', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'
      const input = { adminNotes: '   ' }

      await expect(
        doQuery(
          rejectFeatureRequestMutation,
          { id: featureRequestId, input },
          { context: adminContext }
        )
      ).rejects.toThrow()
    })
  })

  describe('Mutation.deleteFeatureRequest', () => {
    it('should delete a feature request', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'

      // Mock the fetch response for DELETE (204 No Content)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      })

      const result = await doQuery(
        deleteFeatureRequestMutation,
        { id: featureRequestId },
        { context: adminContext }
      )

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/feature-requests/${featureRequestId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      )

      expect(result).toBe(true)
    })

    it('should deny access to non-admin users', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'

      await expect(
        doQuery(
          deleteFeatureRequestMutation,
          { id: featureRequestId }
        )
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should handle API errors', async() => {
      const featureRequestId = '550e8400-e29b-41d4-a716-446655440001'

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Feature request not found'),
      })

      await expect(
        doQuery(
          deleteFeatureRequestMutation,
          { id: featureRequestId },
          { context: adminContext }
        )
      ).rejects.toThrow()
    })
  })
})
