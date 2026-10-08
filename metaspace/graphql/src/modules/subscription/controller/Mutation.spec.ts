import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  userContext,
} from '../../../tests/graphqlTestEnvironment'
import { createTestGroup, createTestUserGroup } from '../../../tests/testDataCreation'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/subscription/controller (mutations)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined
  let testGroupId: string

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

    // Create a test group and make the user an admin of it
    const testGroup = await createTestGroup({ name: 'Test Group' })
    testGroupId = testGroup.id
    await createTestUserGroup(userContext.getUserIdOrFail(), testGroupId, 'GROUP_ADMIN', true)

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
        userId: userContext.getUserIdOrFail(),
        planId: '550e8400-e29b-41d4-a716-446655440002',
        pricingId: 'price_H5UZwgyGXPe2oN',
        email: 'user@example.com',
        name: 'John Doe',
        groupId: testGroupId,
        groupName: 'Test Group',
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
          body: expect.any(String),
        })
      )

      // Parse and compare the actual request body
      const actualBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(actualBody).toEqual({
        userId: subscriptionInput.userId,
        planId: subscriptionInput.planId,
        pricingId: subscriptionInput.pricingId,
        email: subscriptionInput.email,
        name: subscriptionInput.name,
        groupId: subscriptionInput.groupId,
        groupName: subscriptionInput.groupName,
        billingInterval: subscriptionInput.billingInterval,
        paymentMethodId: subscriptionInput.paymentMethodId,
        couponCode: subscriptionInput.couponCode,
      })

      expect(result).toEqual(createdSubscription)
    })

    it('should handle errors when creating a subscription', async() => {
      const subscriptionInput = {
        userId: userContext.getUserIdOrFail(),
        planId: '550e8400-e29b-41d4-a716-446655440002',
        pricingId: 'price_H5UZwgyGXPe2oN',
        email: 'user@example.com',
        name: 'John Doe',
        billingInterval: 'monthly',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid payment method'),
      })

      await expect(
        doQuery(createSubscriptionMutation, { input: subscriptionInput })
      ).rejects.toThrow('Failed to create subscription')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions',
        expect.any(Object)
      )
    })

    it('should omit couponCode when null or empty', async() => {
      const subscriptionInput = {
        userId: userContext.getUserIdOrFail(),
        planId: '550e8400-e29b-41d4-a716-446655440002',
        pricingId: 'price_H5UZwgyGXPe2oN',
        email: 'user@example.com',
        name: 'John Doe',
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
            pricingId: subscriptionInput.pricingId,
            email: subscriptionInput.email,
            name: subscriptionInput.name,
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
        userId: userContext.getUserIdOrFail(),
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
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Subscription not found'),
      })

      await expect(
        doQuery(updateSubscriptionMutation, { id: subscriptionId, input: updateInput })
      ).rejects.toThrow('Failed to update subscription')

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
        userId: userContext.getUserIdOrFail(),
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
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Subscription not found'),
      })

      await expect(
        doQuery(cancelSubscriptionMutation, { id: subscriptionId, input: cancelInput })
      ).rejects.toThrow('Failed to cancel subscription')

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}/cancel`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.createPackSubscription', () => {
    const createPackSubscriptionMutation = `mutation ($input: CreatePackSubscriptionInput!) {
      createPackSubscription(input: $input) {
        invoiceId
        clientSecret
        amountDue
        currency
      }
    }`

    const packCheckout = {
      invoiceId: 'in_1234567890',
      clientSecret: 'pi_1234_secret_5678',
      amountDue: 35000,
      currency: 'usd',
    }

    it('should start a pack checkout and return the payment details', async() => {
      const input = {
        userId: userContext.getUserIdOrFail(),
        planId: '550e8400-e29b-41d4-a716-446655440010',
        pricingId: 'price_pack_6m',
        email: 'user@example.com',
        name: 'John Doe',
        groupId: testGroupId,
        paymentMethodId: 'pm_1234567890',
        couponCode: 'SAVE20',
        address: { country: 'DE', postalCode: '10115', line1: 'Invalidenstr. 1' },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(packCheckout),
      })

      const result = await doQuery(createPackSubscriptionMutation, { input })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions/pack',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      )

      const actualBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(actualBody).toEqual({
        userId: input.userId,
        planId: input.planId,
        pricingId: input.pricingId,
        email: input.email,
        name: input.name,
        groupId: testGroupId,
        customerAddress: input.address,
        paymentMethodId: input.paymentMethodId,
        couponCode: input.couponCode,
      })

      expect(result).toEqual(packCheckout)
    })

    it('should report an active subscription conflict so the caller can offer a top-up', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: () => Promise.resolve(JSON.stringify({ message: 'Group already has an active subscription' })),
      })

      await expect(
        doQuery(createPackSubscriptionMutation, {
          input: {
            userId: userContext.getUserIdOrFail(),
            planId: '550e8400-e29b-41d4-a716-446655440010',
            email: 'user@example.com',
            name: 'John Doe',
            groupId: testGroupId,
          },
        })
      ).rejects.toThrow(/already_subscribed/)
    })

    it('should surface manager validation errors', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ message: 'Plan is not an active pack' })),
      })

      await expect(
        doQuery(createPackSubscriptionMutation, {
          input: {
            userId: userContext.getUserIdOrFail(),
            planId: '550e8400-e29b-41d4-a716-446655440010',
            email: 'user@example.com',
            name: 'John Doe',
            groupId: testGroupId,
          },
        })
      ).rejects.toThrow(/Plan is not an active pack/)
    })
  })

  describe('Mutation.purchaseTopup', () => {
    const purchaseTopupMutation = `mutation ($input: PurchaseTopupInput!) {
      purchaseTopup(input: $input) {
        invoiceId
        clientSecret
        amountDue
        currency
      }
    }`

    const topupCheckout = {
      invoiceId: 'in_topup_1234567890',
      clientSecret: 'pi_topup_secret_5678',
      amountDue: 33300,
      currency: 'usd',
    }

    it('should start a top-up checkout for a group and return the payment details', async() => {
      const input = {
        groupId: testGroupId,
        email: 'user@example.com',
        topupOptionId: 'topup-option-x10',
        paymentMethodId: 'pm_1234567890',
        address: { country: 'DE', postalCode: '10115' },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(topupCheckout),
      })

      const result = await doQuery(purchaseTopupMutation, { input })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/usage-credits/purchase',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      )

      const actualBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(actualBody).toEqual({
        groupId: testGroupId,
        email: input.email,
        topupOptionId: input.topupOptionId,
        paymentMethodId: input.paymentMethodId,
        customerAddress: input.address,
      })

      expect(result).toEqual(topupCheckout)
    })

    it('should report a missing subscription so the caller can offer a pack', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(JSON.stringify({ message: 'No active subscription' })),
      })

      await expect(
        doQuery(purchaseTopupMutation, {
          input: {
            groupId: testGroupId,
            email: 'user@example.com',
            topupOptionId: 'topup-option-x10',
          },
        })
      ).rejects.toThrow(/no_active_subscription/)
    })

    it('should surface manager validation errors', async() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ message: 'Top-up option is not available for this plan' })),
      })

      await expect(
        doQuery(purchaseTopupMutation, {
          input: {
            groupId: testGroupId,
            email: 'user@example.com',
            topupOptionId: 'topup-option-x10',
          },
        })
      ).rejects.toThrow(/Top-up option is not available for this plan/)
    })
  })
})
