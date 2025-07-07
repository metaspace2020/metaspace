import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/subscription/controller (mutations)', () => {
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

  describe('Mutation.createSubscription', () => {
    const createSubscriptionMutation = `mutation ($input: CreateSubscriptionInput!) {
      createSubscription(input: $input) {
        id
        userId
        planId
        billingInterval
        stripeSubscriptionId
        stripeCustomerId
        startedAt
        expiresAt
        cancelledAt
        isActive
        autoRenew
        createdAt
        updatedAt
      }
    }`

    it('should create a new subscription', async() => {
      const subscriptionInput = {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        planId: '550e8400-e29b-41d4-a716-446655440002',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        billingInterval: 'monthly',
        paymentMethodId: 'pm_1234567890',
        couponCode: 'SAVE20',
      }

      const createdSubscription = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        userId: subscriptionInput.userId,
        planId: subscriptionInput.planId,
        billingInterval: subscriptionInput.billingInterval,
        stripeSubscriptionId: 'sub_1234567890',
        stripeCustomerId: 'cus_1234567890',
        startedAt: currentTime.valueOf().toString(),
        expiresAt: null,
        cancelledAt: null,
        isActive: true,
        autoRenew: true,
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          subscription: createdSubscription,
          transaction: {
            id: '241836c8-70a4-46a1-9347-636ecfc782b6',
            userId: subscriptionInput.userId,
            subscriptionId: createdSubscription.id,
            stripePaymentIntentId: 'pi_test',
            stripeInvoiceId: 'in_test',
            stripeSubscriptionId: createdSubscription.stripeSubscriptionId,
            originalAmountCents: 29990,
            finalAmountCents: 29990,
            currency: 'USD',
            status: 'completed',
            type: 'subscription',
          },
          clientSecret: 'pi_test_secret',
        }),
      })

      const result = await doQuery(createSubscriptionMutation, { input: subscriptionInput })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            userId: subscriptionInput.userId,
            planId: subscriptionInput.planId,
            email: subscriptionInput.email,
            name: 'John Doe',
            billingInterval: subscriptionInput.billingInterval,
            paymentMethodId: subscriptionInput.paymentMethodId,
            couponCode: subscriptionInput.couponCode,
          }),
        })
      )

      expect(result).toEqual(createdSubscription)
    })

    it('should handle errors when creating a subscription', async() => {
      const subscriptionInput = {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        planId: '550e8400-e29b-41d4-a716-446655440002',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        billingInterval: 'monthly',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid payment method'),
      })

      try {
        await doQuery(createSubscriptionMutation, { input: subscriptionInput })
        fail('Expected mutation to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to create subscription')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions',
        expect.any(Object)
      )
    })

    it('should omit couponCode when null or empty', async() => {
      const subscriptionInput = {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        planId: '550e8400-e29b-41d4-a716-446655440002',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        billingInterval: 'monthly',
        paymentMethodId: 'pm_1234567890',
        couponCode: null,
      }

      const createdSubscription = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        userId: subscriptionInput.userId,
        planId: subscriptionInput.planId,
        billingInterval: subscriptionInput.billingInterval,
        stripeSubscriptionId: 'sub_1234567890',
        stripeCustomerId: 'cus_1234567890',
        startedAt: currentTime.valueOf().toString(),
        expiresAt: null,
        cancelledAt: null,
        isActive: true,
        autoRenew: true,
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          subscription: createdSubscription,
          transaction: {
            id: '241836c8-70a4-46a1-9347-636ecfc782b6',
            userId: subscriptionInput.userId,
            subscriptionId: createdSubscription.id,
            stripePaymentIntentId: 'pi_test',
            stripeInvoiceId: 'in_test',
            stripeSubscriptionId: createdSubscription.stripeSubscriptionId,
            originalAmountCents: 29990,
            finalAmountCents: 29990,
            currency: 'USD',
            status: 'completed',
            type: 'subscription',
          },
          clientSecret: 'pi_test_secret',
        }),
      })

      await doQuery(createSubscriptionMutation, { input: subscriptionInput })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            userId: subscriptionInput.userId,
            planId: subscriptionInput.planId,
            email: subscriptionInput.email,
            name: 'John Doe',
            billingInterval: subscriptionInput.billingInterval,
            paymentMethodId: subscriptionInput.paymentMethodId,
            // couponCode should be omitted entirely
          }),
        })
      )
    })
  })

  describe('Mutation.updateSubscription', () => {
    const updateSubscriptionMutation = `mutation ($id: ID!, $input: UpdateSubscriptionInput!) {
      updateSubscription(id: $id, input: $input) {
        id
        userId
        planId
        autoRenew
        updatedAt
      }
    }`

    it('should update a subscription', async() => {
      const subscriptionId = '550e8400-e29b-41d4-a716-446655440001'
      const updateInput = {
        autoRenew: false,
      }

      const updatedSubscription = {
        id: subscriptionId,
        userId: '550e8400-e29b-41d4-a716-446655440001',
        planId: '550e8400-e29b-41d4-a716-446655440002',
        autoRenew: false,
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          subscription: updatedSubscription,
          transaction: null,
          clientSecret: null,
        }),
      })

      const result = await doQuery(updateSubscriptionMutation, { id: subscriptionId, input: updateInput })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(updateInput),
        })
      )

      expect(result).toEqual(updatedSubscription)
    })

    it('should handle errors when updating a subscription', async() => {
      const subscriptionId = '999'
      const updateInput = {
        autoRenew: false,
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        text: () => Promise.resolve('Subscription not found'),
      })

      try {
        await doQuery(updateSubscriptionMutation, { id: subscriptionId, input: updateInput })
        fail('Expected mutation to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update subscription')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.cancelSubscription', () => {
    const cancelSubscriptionMutation = `mutation ($id: ID!, $input: CancelSubscriptionInput) {
      cancelSubscription(id: $id, input: $input) {
        id
        userId
        planId
        cancelledAt
        isActive
        updatedAt
      }
    }`

    it('should cancel a subscription', async() => {
      const subscriptionId = '550e8400-e29b-41d4-a716-446655440001'
      const cancelInput = {
        reason: 'User requested cancellation',
      }

      const cancelledSubscription = {
        id: subscriptionId,
        userId: '550e8400-e29b-41d4-a716-446655440001',
        planId: '550e8400-e29b-41d4-a716-446655440002',
        cancelledAt: currentTime.valueOf().toString(),
        isActive: false,
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          subscription: cancelledSubscription,
          transaction: null,
          clientSecret: null,
        }),
      })

      const result = await doQuery(cancelSubscriptionMutation, { id: subscriptionId, input: cancelInput })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}/cancel`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(cancelInput),
        })
      )

      expect(result).toEqual(cancelledSubscription)
    })

    it('should handle errors when cancelling a subscription', async() => {
      const subscriptionId = '999'
      const cancelInput = {
        reason: 'User requested cancellation',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        text: () => Promise.resolve('Subscription not found'),
      })

      try {
        await doQuery(cancelSubscriptionMutation, { id: subscriptionId, input: cancelInput })
        fail('Expected mutation to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to cancel subscription')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}/cancel`,
        expect.any(Object)
      )
    })
  })
})
