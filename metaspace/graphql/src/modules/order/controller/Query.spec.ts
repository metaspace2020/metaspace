import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  adminContext,
} from '../../../tests/graphqlTestEnvironment'
import * as moment from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/order/controller (queries)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined

  const ORDERS = [
    {
      id: 1,
      userId: 'user1',
      planId: 1,
      orderId: 'ord-001',
      status: 'completed',
      type: 'subscription',
      totalAmount: 10000,
      currency: 'USD',
      items: [
        {
          name: 'Premium Plan',
          productId: 'prod-001',
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: 2,
      userId: 'user1',
      planId: 2,
      orderId: 'ord-002',
      status: 'pending',
      type: 'one-time',
      totalAmount: 5000,
      currency: 'EUR',
      items: [
        {
          name: 'Data Analysis',
          productId: 'prod-002',
          quantity: 1,
          unitPrice: 5000,
        },
      ],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: 3,
      userId: 'user2',
      planId: 1,
      orderId: 'ord-003',
      status: 'processing',
      type: 'subscription',
      totalAmount: 15000,
      currency: 'USD',
      items: [
        {
          name: 'Enterprise Plan',
          productId: 'prod-003',
          quantity: 1,
          unitPrice: 15000,
        },
      ],
      createdAt: currentTime,
      updatedAt: currentTime,
    },
  ]

  const PAYMENTS = [
    {
      id: 1,
      orderId: 1,
      userId: 'user1',
      amount: 10000,
      currency: 'USD',
      paymentMethod: 'credit_card',
      status: 'completed',
      transactionId: 'txn-001',
      gatewayReference: 'ref-001',
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: 2,
      orderId: 2,
      userId: 'user1',
      amount: 5000,
      currency: 'EUR',
      paymentMethod: 'paypal',
      status: 'pending',
      transactionId: 'txn-002',
      gatewayReference: 'ref-002',
      createdAt: currentTime,
      updatedAt: currentTime,
    },
    {
      id: 3,
      orderId: 3,
      userId: 'user2',
      amount: 15000,
      currency: 'USD',
      paymentMethod: 'bank_transfer',
      status: 'processing',
      transactionId: 'txn-003',
      gatewayReference: 'ref-003',
      createdAt: currentTime,
      updatedAt: currentTime,
    },
  ]

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    // Set the manager API URL
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(async() => {
    await onAfterAll()
    // Restore original config value if it was defined
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      // If it was undefined, we need to use delete to remove the property
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

  describe('Query.order', () => {
    const queryOrder = `query ($id: Int!) {
      order(id: $id) {
        id
        userId
        planId
        orderId
        status
        type
        totalAmount
        currency
        items {
          name
          productId
          quantity
          unitPrice
        }
        createdAt
        updatedAt
      }
    }`

    it('should return an order by id', async() => {
      const orderId = 1
      const expectedOrder = ORDERS.find(order => order.id === orderId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedOrder,
          createdAt: moment(expectedOrder!.createdAt).valueOf().toString(),
          updatedAt: moment(expectedOrder!.updatedAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryOrder, { id: orderId })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/orders/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        id: expectedOrder!.id,
        userId: expectedOrder!.userId,
        planId: expectedOrder!.planId,
        orderId: expectedOrder!.orderId,
        status: expectedOrder!.status,
        type: expectedOrder!.type,
        totalAmount: expectedOrder!.totalAmount,
        currency: expectedOrder!.currency,
        items: expectedOrder!.items,
        createdAt: moment(expectedOrder!.createdAt).valueOf().toString(),
        updatedAt: moment(expectedOrder!.updatedAt).valueOf().toString(),
      })
    })

    it('should handle errors when fetching an order', async() => {
      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      const result = await doQuery(queryOrder, { id: 999 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/orders/999',
        expect.any(Object)
      )

      expect(result).toBeNull()
    })
  })

  describe('Query.allOrders', () => {
    const queryAllOrders = `query($filter: OrderFilter, $orderBy: OrderOrderBy, $sortingOrder: SortingOrder, $page: Int, $limit: Int) {
      allOrders(
        filter: $filter,
        orderBy: $orderBy,
        sortingOrder: $sortingOrder,
        page: $page,
        limit: $limit
      ) {
        id
        userId
        planId
        orderId
        status
        type
        totalAmount
        currency
        items {
          name
          productId
          quantity
          unitPrice
        }
        createdAt
        updatedAt
      }
    }`

    it('should return all orders', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: ORDERS.map(order => ({
            ...order,
            createdAt: moment(order.createdAt).valueOf().toString(),
            updatedAt: moment(order.updatedAt).valueOf().toString(),
          })),
          meta: {
            total: ORDERS.length,
          },
        }),
      })

      const result = await doQuery(queryAllOrders)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/orders'),
        expect.any(Object)
      )

      expect(result).toEqual(ORDERS.map(order => ({
        ...order,
        createdAt: moment(order.createdAt).valueOf().toString(),
        updatedAt: moment(order.updatedAt).valueOf().toString(),
      })))
    })

    it('should filter orders by userId', async() => {
      const userId = 'user1'
      const filteredOrders = ORDERS.filter(order => order.userId === userId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredOrders.map(order => ({
            ...order,
            createdAt: moment(order.createdAt).valueOf().toString(),
            updatedAt: moment(order.updatedAt).valueOf().toString(),
          })),
          meta: {
            total: filteredOrders.length,
          },
        }),
      })

      const result = await doQuery(queryAllOrders, {
        filter: { userId },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/orders?'),
        expect.any(Object)
      )
      // Check for the correct flat query parameter
      expect(mockFetch.mock.calls[0][0]).toContain('userId=user1')

      expect(result.length).toEqual(filteredOrders.length)
      expect(result.every((order: any) => order.userId === userId)).toBeTruthy()
    })

    it('should handle pagination correctly', async() => {
      const page = 2
      const limit = 1
      const paginatedOrder = ORDERS[1] // Simulating 2nd page with 1 item per page

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{
            ...paginatedOrder,
            createdAt: moment(paginatedOrder.createdAt).valueOf().toString(),
            updatedAt: moment(paginatedOrder.updatedAt).valueOf().toString(),
          }],
          meta: {
            total: ORDERS.length,
          },
        }),
      })

      const result = await doQuery(queryAllOrders, {
        page,
        limit,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/orders?'),
        expect.any(Object)
      )
      // Should have converted page/limit to offset/limit
      expect(mockFetch.mock.calls[0][0]).toContain('offset=1')
      expect(mockFetch.mock.calls[0][0]).toContain('limit=1')

      expect(result.length).toEqual(1)
      expect(result[0].id).toEqual(paginatedOrder.id)
    })
  })

  describe('Query.ordersCount', () => {
    const queryOrdersCount = `query($filter: OrderFilter) {
      ordersCount(filter: $filter)
    }`

    it('should return the total count of orders', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: {
            total: ORDERS.length,
          },
        }),
      })

      const result = await doQuery(queryOrdersCount)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/orders'),
        expect.any(Object)
      )

      expect(result).toEqual(ORDERS.length)
    })

    it('should return the filtered count of orders', async() => {
      const userId = 'user1'
      const filteredCount = ORDERS.filter(order => order.userId === userId).length

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: {
            total: filteredCount,
          },
        }),
      })

      const result = await doQuery(queryOrdersCount, {
        filter: { userId },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/orders?'),
        expect.any(Object)
      )
      // Check for the correct flat query parameter
      expect(mockFetch.mock.calls[0][0]).toContain('userId=user1')

      expect(result).toEqual(filteredCount)
    })
  })

  describe('Query.payment', () => {
    const queryPayment = `query ($id: Int!) {
      payment(id: $id) {
        id
        orderId
        userId
        amount
        currency
        paymentMethod
        status
        transactionId
        gatewayReference
        createdAt
        updatedAt
      }
    }`

    it('should return a payment by id', async() => {
      const paymentId = 1
      const expectedPayment = PAYMENTS.find(payment => payment.id === paymentId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...expectedPayment,
          createdAt: moment(expectedPayment!.createdAt).valueOf().toString(),
          updatedAt: moment(expectedPayment!.updatedAt).valueOf().toString(),
        }),
      })

      const result = await doQuery(queryPayment, { id: paymentId })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/payments/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toEqual({
        id: expectedPayment!.id,
        orderId: expectedPayment!.orderId,
        userId: expectedPayment!.userId,
        amount: expectedPayment!.amount,
        currency: expectedPayment!.currency,
        paymentMethod: expectedPayment!.paymentMethod,
        status: expectedPayment!.status,
        transactionId: expectedPayment!.transactionId,
        gatewayReference: expectedPayment!.gatewayReference,
        createdAt: moment(expectedPayment!.createdAt).valueOf().toString(),
        updatedAt: moment(expectedPayment!.updatedAt).valueOf().toString(),
      })
    })

    it('should handle errors when fetching a payment', async() => {
      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      const result = await doQuery(queryPayment, { id: 999 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/payments/999',
        expect.any(Object)
      )

      expect(result).toBeNull()
    })
  })

  describe('Query.allPayments', () => {
    const queryAllPayments = `query($filter: PaymentFilter, $orderBy: PaymentOrderBy, $sortingOrder: SortingOrder, $page: Int, $limit: Int) {
      allPayments(
        filter: $filter,
        orderBy: $orderBy,
        sortingOrder: $sortingOrder,
        page: $page,
        limit: $limit
      ) {
        id
        orderId
        userId
        amount
        currency
        paymentMethod
        status
        transactionId
        gatewayReference
        createdAt
        updatedAt
      }
    }`

    it('should return all payments', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: PAYMENTS.map(payment => ({
            ...payment,
            createdAt: moment(payment.createdAt).valueOf().toString(),
            updatedAt: moment(payment.updatedAt).valueOf().toString(),
          })),
          meta: {
            total: PAYMENTS.length,
          },
        }),
      })

      const result = await doQuery(queryAllPayments)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/payments'),
        expect.any(Object)
      )

      expect(result).toEqual(PAYMENTS.map(payment => ({
        ...payment,
        createdAt: moment(payment.createdAt).valueOf().toString(),
        updatedAt: moment(payment.updatedAt).valueOf().toString(),
      })))
    })

    it('should filter payments by orderId', async() => {
      const orderId = 1
      const filteredPayments = PAYMENTS.filter(payment => payment.orderId === orderId)

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: filteredPayments.map(payment => ({
            ...payment,
            createdAt: moment(payment.createdAt).valueOf().toString(),
            updatedAt: moment(payment.updatedAt).valueOf().toString(),
          })),
          meta: {
            total: filteredPayments.length,
          },
        }),
      })

      const result = await doQuery(queryAllPayments, {
        filter: { orderId },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/payments?'),
        expect.any(Object)
      )
      // Check for the correct flat query parameter
      expect(mockFetch.mock.calls[0][0]).toContain('orderId=1')

      expect(result.length).toEqual(filteredPayments.length)
      expect(result.every((payment: any) => payment.orderId === orderId)).toBeTruthy()
    })
  })

  describe('Query.paymentsCount', () => {
    const queryPaymentsCount = `query($filter: PaymentFilter) {
      paymentsCount(filter: $filter)
    }`

    it('should return the total count of payments', async() => {
      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: {
            total: PAYMENTS.length,
          },
        }),
      })

      const result = await doQuery(queryPaymentsCount)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/payments'),
        expect.any(Object)
      )

      expect(result).toEqual(PAYMENTS.length)
    })

    it('should return the filtered count of payments', async() => {
      const userId = 'user1'
      const filteredCount = PAYMENTS.filter(payment => payment.userId === userId).length

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          meta: {
            total: filteredCount,
          },
        }),
      })

      const result = await doQuery(queryPaymentsCount, {
        filter: { userId },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-api.metaspace.example/api/payments?'),
        expect.any(Object)
      )
      // Check for the correct flat query parameter
      expect(mockFetch.mock.calls[0][0]).toContain('userId=user1')

      expect(result).toEqual(filteredCount)
    })
  })

  describe('Order.payments field resolver', () => {
    const queryOrderWithPayments = `query ($id: Int!) {
      order(id: $id) {
        id
        orderId
        payments {
          id
          orderId
          amount
          status
        }
      }
    }`

    it('should fetch payments associated with an order', async() => {
      const orderId = 1
      const order = ORDERS.find(o => o.id === orderId)
      const orderPayments = PAYMENTS.filter(p => p.orderId === orderId)

      // Mock the fetch responses - first for order, then for order payments
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...order,
            createdAt: moment(order!.createdAt).valueOf().toString(),
            updatedAt: moment(order!.updatedAt).valueOf().toString(),
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: orderPayments.map(payment => ({
              ...payment,
              createdAt: moment(payment.createdAt).valueOf().toString(),
              updatedAt: moment(payment.updatedAt).valueOf().toString(),
            })),
          }),
        })

      const result = await doQuery(queryOrderWithPayments, { id: orderId })

      // Verify the first fetch call was for the order
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/orders/1',
        expect.any(Object)
      )

      // Verify the second fetch call was for the order's payments using orderId parameter directly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/payments?orderId=1',
        expect.any(Object)
      )

      // Check the result includes the order and its payments
      expect(result).toEqual({
        id: orderId,
        orderId: order!.orderId,
        payments: orderPayments.map(payment => ({
          id: payment.id,
          orderId: payment.orderId,
          amount: payment.amount,
          status: payment.status,
        })),
      })
    })
  })
})
