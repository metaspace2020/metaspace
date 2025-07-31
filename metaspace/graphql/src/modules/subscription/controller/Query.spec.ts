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
  userContext,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/subscription/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined

  const SUBSCRIPTIONS = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      userId: '', // Will be set to testUser.id after setup
      planId: '550e8400-e29b-41d4-a716-446655440002',
      billingInterval: 'monthly',
      stripeSubscriptionId: 'sub_1234567890',
      stripeCustomerId: 'cus_1234567890',
      startedAt: currentTime,
      expiresAt: null,
      cancelledAt: null,
      isActive: true,
      autoRenew: true,
      transactions: [],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      userId: '', // Will be set to testUser.id after setup
      planId: '550e8400-e29b-41d4-a716-446655440004',
      billingInterval: 'yearly',
      stripeSubscriptionId: 'sub_0987654321',
      stripeCustomerId: 'cus_0987654321',
      startedAt: currentTime,
      expiresAt: moment(currentTime).add(1, 'year').toDate(),
      cancelledAt: null,
      isActive: true,
      autoRenew: true,
      transactions: [],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440005',
      userId: '', // Will be set to adminUser.id after setup
      planId: '550e8400-e29b-41d4-a716-446655440002',
      billingInterval: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      startedAt: currentTime,
      expiresAt: null,
      cancelledAt: null,
      isActive: true,
      autoRenew: false,
      transactions: [],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
  ]

  const TRANSACTIONS = [
    {
      id: '650e8400-e29b-41d4-a716-446655440001',
      userId: '', // Will be set to testUser.id after setup
      subscriptionId: '550e8400-e29b-41d4-a716-446655440001',
      stripePaymentIntentId: 'pi_1234567890',
      stripeInvoiceId: 'in_1234567890',
      stripeSubscriptionId: 'sub_1234567890',
      originalAmountCents: 2000,
      finalAmountCents: 1600,
      currency: 'USD',
      couponApplied: true,
      stripeCouponId: 'coup_SAVE20',
      couponName: 'SAVE20',
      discountAmountCents: 400,
      discountPercentage: 20.0,
      status: 'completed',
      type: 'subscription',
      transactionDate: currentTime,
      description: 'Monthly subscription payment',
      metadata: { source: 'stripe' },
      billingPeriodStart: currentTime,
      billingPeriodEnd: moment(currentTime).add(1, 'month').toDate(),
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: '650e8400-e29b-41d4-a716-446655440002',
      userId: '', // Will be set to adminUser.id after setup
      subscriptionId: '550e8400-e29b-41d4-a716-446655440005',
      stripePaymentIntentId: null,
      stripeInvoiceId: null,
      stripeSubscriptionId: null,
      originalAmountCents: 0,
      finalAmountCents: 0,
      currency: 'USD',
      couponApplied: false,
      stripeCouponId: null,
      couponName: null,
      discountAmountCents: null,
      discountPercentage: null,
      status: 'completed',
      type: 'subscription',
      transactionDate: currentTime,
      description: 'Free plan subscription',
      metadata: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      createdAt: currentTime,
      updatedAt: currentTime,
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
    SUBSCRIPTIONS[0].userId = testUser.id
    SUBSCRIPTIONS[1].userId = testUser.id
    SUBSCRIPTIONS[2].userId = adminUser.id

    TRANSACTIONS[0].userId = testUser.id
    TRANSACTIONS[1].userId = adminUser.id

    mockFetch.mockClear()
  })

  afterEach(async() => {
    await onAfterEach()
  })

  describe('Query.subscription', () => {
    const querySubscription = `query ($id: ID!) {
      subscription(id: $id) {
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

    it('should return a subscription by id', async() => {
      const subscriptionId = '550e8400-e29b-41d4-a716-446655440001'
      const expectedSubscription = SUBSCRIPTIONS.find(sub => sub.id === subscriptionId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedSubscription,
          startedAt: moment(expectedSubscription!.startedAt).valueOf().toString(),
          expiresAt: expectedSubscription!.expiresAt ? moment(expectedSubscription!.expiresAt).valueOf().toString() : null,
          cancelledAt: expectedSubscription!.cancelledAt ? moment(expectedSubscription!.cancelledAt).valueOf().toString() : null,
          createdAt: moment(expectedSubscription!.createdAt).valueOf().toString(),
          updatedAt: moment(expectedSubscription!.updatedAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(querySubscription, { id: subscriptionId })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/${subscriptionId}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        id: expectedSubscription!.id,
        userId: expectedSubscription!.userId,
        planId: expectedSubscription!.planId,
        billingInterval: expectedSubscription!.billingInterval,
        stripeSubscriptionId: expectedSubscription!.stripeSubscriptionId,
        stripeCustomerId: expectedSubscription!.stripeCustomerId,
        startedAt: moment(expectedSubscription!.startedAt).valueOf().toString(),
        expiresAt: expectedSubscription!.expiresAt ? moment(expectedSubscription!.expiresAt).valueOf().toString() : null,
        cancelledAt: expectedSubscription!.cancelledAt ? moment(expectedSubscription!.cancelledAt).valueOf().toString() : null,
        isActive: expectedSubscription!.isActive,
        autoRenew: expectedSubscription!.autoRenew,
        createdAt: moment(expectedSubscription!.createdAt).valueOf().toString(),
        updatedAt: moment(expectedSubscription!.updatedAt).valueOf().toString(),
      })
    })

    it('should handle errors when fetching a subscription', async() => {
      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      const result = await doQuery(querySubscription, { id: '999' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/subscriptions/999',
        expect.any(Object)
      )

      expect(result).toBeNull()
    })
  })

  describe('Query.transaction', () => {
    const queryTransaction = `query ($id: ID!) {
      transaction(id: $id) {
        id
        userId
        subscriptionId
        stripePaymentIntentId
        stripeInvoiceId
        stripeSubscriptionId
        originalAmountCents
        finalAmountCents
        currency
        couponApplied
        stripeCouponId
        couponName
        discountAmountCents
        discountPercentage
        status
        type
        transactionDate
        description
        metadata
        billingPeriodStart
        billingPeriodEnd
        createdAt
        updatedAt
      }
    }`

    it('should return a transaction by id', async() => {
      const transactionId = '650e8400-e29b-41d4-a716-446655440001'
      const expectedTransaction = TRANSACTIONS.find(tx => tx.id === transactionId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedTransaction,
          transactionDate: moment(expectedTransaction!.transactionDate).valueOf().toString(),
          billingPeriodStart: expectedTransaction!.billingPeriodStart ? moment(expectedTransaction!.billingPeriodStart).valueOf().toString() : null,
          billingPeriodEnd: expectedTransaction!.billingPeriodEnd ? moment(expectedTransaction!.billingPeriodEnd).valueOf().toString() : null,
          createdAt: moment(expectedTransaction!.createdAt).valueOf().toString(),
          updatedAt: moment(expectedTransaction!.updatedAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryTransaction, { id: transactionId })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/transactions/${transactionId}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        id: expectedTransaction!.id,
        userId: expectedTransaction!.userId,
        subscriptionId: expectedTransaction!.subscriptionId,
        stripePaymentIntentId: expectedTransaction!.stripePaymentIntentId,
        stripeInvoiceId: expectedTransaction!.stripeInvoiceId,
        stripeSubscriptionId: expectedTransaction!.stripeSubscriptionId,
        originalAmountCents: expectedTransaction!.originalAmountCents,
        finalAmountCents: expectedTransaction!.finalAmountCents,
        currency: expectedTransaction!.currency,
        couponApplied: expectedTransaction!.couponApplied,
        stripeCouponId: expectedTransaction!.stripeCouponId,
        couponName: expectedTransaction!.couponName,
        discountAmountCents: expectedTransaction!.discountAmountCents,
        discountPercentage: expectedTransaction!.discountPercentage,
        status: expectedTransaction!.status,
        type: expectedTransaction!.type,
        transactionDate: moment(expectedTransaction!.transactionDate).valueOf().toString(),
        description: expectedTransaction!.description,
        metadata: expectedTransaction!.metadata,
        billingPeriodStart: expectedTransaction!.billingPeriodStart ? moment(expectedTransaction!.billingPeriodStart).valueOf().toString() : null,
        billingPeriodEnd: expectedTransaction!.billingPeriodEnd ? moment(expectedTransaction!.billingPeriodEnd).valueOf().toString() : null,
        createdAt: moment(expectedTransaction!.createdAt).valueOf().toString(),
        updatedAt: moment(expectedTransaction!.updatedAt).valueOf().toString(),
      })
    })
  })

  describe('Query.allSubscriptions', () => {
    const queryAllSubscriptions = `query($filter: SubscriptionFilter, $orderBy: SubscriptionOrderBy, $sortingOrder: SortingOrder, $offset: Int, $limit: Int) {
      allSubscriptions(
        filter: $filter,
        orderBy: $orderBy,
        sortingOrder: $sortingOrder,
        offset: $offset,
        limit: $limit
      ) {
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

    it('should return all subscriptions', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: SUBSCRIPTIONS.map(subscription => ({
            id: subscription.id,
            userId: subscription.userId,
            planId: subscription.planId,
            billingInterval: subscription.billingInterval,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            stripeCustomerId: subscription.stripeCustomerId,
            startedAt: moment(subscription.startedAt).valueOf().toString(),
            expiresAt: subscription.expiresAt ? moment(subscription.expiresAt).valueOf().toString() : null,
            cancelledAt: subscription.cancelledAt ? moment(subscription.cancelledAt).valueOf().toString() : null,
            isActive: subscription.isActive,
            autoRenew: subscription.autoRenew,
            createdAt: moment(subscription.createdAt).valueOf().toString(),
            updatedAt: moment(subscription.updatedAt).valueOf().toString(),
          })),
          meta: {
            total: SUBSCRIPTIONS.length,
          },
        }),
      })

      const result = await doQuery(queryAllSubscriptions, {}, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/subscriptions'),
        expect.any(Object)
      )

      expect(result).toEqual(SUBSCRIPTIONS.map(subscription => ({
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        billingInterval: subscription.billingInterval,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        startedAt: moment(subscription.startedAt).valueOf().toString(),
        expiresAt: subscription.expiresAt ? moment(subscription.expiresAt).valueOf().toString() : null,
        cancelledAt: subscription.cancelledAt ? moment(subscription.cancelledAt).valueOf().toString() : null,
        isActive: subscription.isActive,
        autoRenew: subscription.autoRenew,
        createdAt: moment(subscription.createdAt).valueOf().toString(),
        updatedAt: moment(subscription.updatedAt).valueOf().toString(),
      })))
    })

    it('should handle errors when fetching all subscriptions', async() => {
      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      })

      const result = await doQuery(queryAllSubscriptions, {}, { context: adminContext })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/subscriptions'),
        expect.any(Object)
      )

      expect(result).toEqual([])
    })
  })

  describe('Query.userSubscriptions', () => {
    const queryUserSubscriptions = `query {
      userSubscriptions {
        id
        userId
        planId
        billingInterval
        isActive
        autoRenew
        createdAt
        updatedAt
      }
    }`

    it('should return subscriptions for a user', async() => {
      const userId = testUser.id
      const userSubscriptions = SUBSCRIPTIONS.filter(sub => sub.userId === userId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(userSubscriptions.map(subscription => ({
          id: subscription.id,
          userId: subscription.userId,
          planId: subscription.planId,
          billingInterval: subscription.billingInterval,
          isActive: subscription.isActive,
          autoRenew: subscription.autoRenew,
          createdAt: moment(subscription.createdAt).valueOf().toString(),
          updatedAt: moment(subscription.updatedAt).valueOf().toString(),
        }))),
      })

      const result = await doQuery(queryUserSubscriptions, null, { context: userContext })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/user/${testUser.id}`,
        expect.any(Object)
      )

      expect(result).toEqual(userSubscriptions.map(subscription => ({
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        billingInterval: subscription.billingInterval,
        isActive: subscription.isActive,
        autoRenew: subscription.autoRenew,
        createdAt: moment(subscription.createdAt).valueOf().toString(),
        updatedAt: moment(subscription.updatedAt).valueOf().toString(),
      })))
    })
  })

  describe('Query.activeUserSubscription', () => {
    const queryActiveUserSubscription = `query {
      activeUserSubscription {
        id
        userId
        planId
        isActive
        autoRenew
        createdAt
        updatedAt
      }
    }`

    it('should return active subscription for a user', async() => {
      const userId = testUser.id
      const activeSubscription = SUBSCRIPTIONS.find(sub => sub.userId === userId && sub.isActive)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: activeSubscription!.id,
          userId: activeSubscription!.userId,
          planId: activeSubscription!.planId,
          isActive: activeSubscription!.isActive,
          autoRenew: activeSubscription!.autoRenew,
          createdAt: moment(activeSubscription!.createdAt).valueOf().toString(),
          updatedAt: moment(activeSubscription!.updatedAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryActiveUserSubscription, null, { context: userContext })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/subscriptions/user/${userId}/active`,
        expect.any(Object)
      )

      expect(result).toEqual({
        id: activeSubscription!.id,
        userId: activeSubscription!.userId,
        planId: activeSubscription!.planId,
        isActive: activeSubscription!.isActive,
        autoRenew: activeSubscription!.autoRenew,
        createdAt: moment(activeSubscription!.createdAt).valueOf().toString(),
        updatedAt: moment(activeSubscription!.updatedAt).valueOf().toString(),
      })
    })
  })
})
