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

describe('modules/order/controller (mutations)', () => {
  const currentTime: any = moment.utc(moment.utc().toDate())
  let originalManagerApiUrl: string | undefined

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

  describe('Mutation.createOrder', () => {
    const createOrderMutation = `mutation ($input: CreateOrderInput!) {
      createOrder(input: $input) {
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

    it('should create a new order', async() => {
      const orderInput = {
        userId: 'user1',
        planId: 1,
        orderId: 'ord-001',
        status: 'pending',
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
      }

      const createdOrder = {
        id: 1,
        ...orderInput,
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdOrder),
      })

      const result = await doQuery(createOrderMutation, { input: orderInput })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/orders',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(orderInput),
        })
      )

      expect(result).toEqual(createdOrder)
    })

    it('should handle errors when creating an order', async() => {
      const orderInput = {
        userId: 'user1',
        planId: 1,
        orderId: 'ord-001',
        status: 'pending',
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
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      try {
        await doQuery(createOrderMutation, { input: orderInput })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to create order')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/orders',
        expect.any(Object)
      )
    })
  })

  describe('Mutation.updateOrder', () => {
    const updateOrderMutation = `mutation ($id: Int!, $input: UpdateOrderInput!) {
      updateOrder(id: $id, input: $input) {
        id
        status
        metadata
      }
    }`

    it('should update an existing order', async() => {
      const orderId = 1
      const updateInput = {
        status: 'completed',
        metadata: { note: 'Order completed successfully' },
      }

      const updatedOrder = {
        id: orderId,
        ...updateInput,
        userId: 'user1',
        planId: 1,
        orderId: 'ord-001',
        type: 'subscription',
        totalAmount: 10000,
        currency: 'USD',
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedOrder),
      })

      const result = await doQuery(updateOrderMutation, { id: orderId, input: updateInput })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/orders/${orderId}`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(updateInput),
        })
      )

      expect(result).toEqual({
        id: orderId,
        status: updateInput.status,
        metadata: updateInput.metadata,
      })
    })

    it('should handle errors when updating an order', async() => {
      const orderId = 999
      const updateInput = {
        status: 'completed',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      try {
        await doQuery(updateOrderMutation, { id: orderId, input: updateInput })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update order')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/orders/${orderId}`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.deleteOrder', () => {
    const deleteOrderMutation = `mutation ($id: Int!) {
      deleteOrder(id: $id)
    }`

    it('should delete an order', async() => {
      const orderId = 1

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const result = await doQuery(deleteOrderMutation, { id: orderId })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/orders/${orderId}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toBe(true)
    })

    it('should handle errors when deleting an order', async() => {
      const orderId = 999

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      try {
        await doQuery(deleteOrderMutation, { id: orderId })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to delete order')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/orders/${orderId}`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.createPayment', () => {
    const createPaymentMutation = `mutation ($input: CreatePaymentInput!) {
      createPayment(input: $input) {
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

    it('should create a new payment', async() => {
      const paymentInput = {
        orderId: 1,
        userId: 'user1',
        amount: 10000,
        currency: 'USD',
        paymentMethod: 'credit_card',
        status: 'completed',
        transactionId: 'txn-001',
        gatewayReference: 'ref-001',
      }

      const createdPayment = {
        id: 1,
        ...paymentInput,
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdPayment),
      })

      const result = await doQuery(createPaymentMutation, { input: paymentInput })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/payments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(paymentInput),
        })
      )

      expect(result).toEqual(createdPayment)
    })

    it('should handle errors when creating a payment', async() => {
      const paymentInput = {
        orderId: 999,
        userId: 'user1',
        amount: 10000,
        currency: 'USD',
        paymentMethod: 'credit_card',
        status: 'completed',
        transactionId: 'txn-001',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      try {
        await doQuery(createPaymentMutation, { input: paymentInput })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to create payment')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.metaspace.example/api/payments',
        expect.any(Object)
      )
    })
  })

  describe('Mutation.updatePayment', () => {
    const updatePaymentMutation = `mutation ($id: Int!, $input: UpdatePaymentInput!) {
      updatePayment(id: $id, input: $input) {
        id
        status
        metadata
      }
    }`

    it('should update an existing payment', async() => {
      const paymentId = 1
      const updateInput = {
        status: 'completed',
        metadata: { note: 'Payment processed successfully' },
      }

      const updatedPayment = {
        id: paymentId,
        ...updateInput,
        orderId: 1,
        userId: 'user1',
        amount: 10000,
        currency: 'USD',
        paymentMethod: 'credit_card',
        transactionId: 'txn-001',
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedPayment),
      })

      const result = await doQuery(updatePaymentMutation, { id: paymentId, input: updateInput })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/${paymentId}`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(updateInput),
        })
      )

      expect(result).toEqual({
        id: paymentId,
        status: updateInput.status,
        metadata: updateInput.metadata,
      })
    })

    it('should handle errors when updating a payment', async() => {
      const paymentId = 999
      const updateInput = {
        status: 'completed',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      try {
        await doQuery(updatePaymentMutation, { id: paymentId, input: updateInput })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to update payment')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/${paymentId}`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.deletePayment', () => {
    const deletePaymentMutation = `mutation ($id: Int!) {
      deletePayment(id: $id)
    }`

    it('should delete a payment', async() => {
      const paymentId = 1

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const result = await doQuery(deletePaymentMutation, { id: paymentId })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/${paymentId}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(result).toBe(true)
    })

    it('should handle errors when deleting a payment', async() => {
      const paymentId = 999

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      try {
        await doQuery(deletePaymentMutation, { id: paymentId })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to delete payment')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/${paymentId}`,
        expect.any(Object)
      )
    })
  })

  describe('Mutation.refundPayment', () => {
    const refundPaymentMutation = `mutation ($id: Int!, $input: RefundPaymentInput!) {
      refundPayment(id: $id, input: $input) {
        id
        status
        amount
      }
    }`

    it('should refund a payment', async() => {
      const paymentId = 1
      const refundInput = {
        amount: 5000,
        reason: 'Partial refund requested by customer',
      }

      const refundedPayment = {
        id: paymentId,
        orderId: 1,
        userId: 'user1',
        amount: 5000, // Reduced amount after partial refund
        currency: 'USD',
        paymentMethod: 'credit_card',
        status: 'refunded',
        transactionId: 'txn-001',
        createdAt: currentTime.valueOf().toString(),
        updatedAt: currentTime.valueOf().toString(),
      }

      // Mock the fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(refundedPayment),
      })

      const result = await doQuery(refundPaymentMutation, { id: paymentId, input: refundInput })

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/refund/${paymentId}`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(refundInput),
        })
      )

      expect(result).toEqual({
        id: paymentId,
        status: 'refunded',
        amount: 5000,
      })
    })

    it('should handle errors when refunding a payment', async() => {
      const paymentId = 999
      const refundInput = {
        amount: 1000,
        reason: 'Customer requested refund',
      }

      // Mock the fetch response to simulate an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      try {
        await doQuery(refundPaymentMutation, { id: paymentId, input: refundInput })
        fail('Expected query to throw an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to refund payment')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `https://test-api.metaspace.example/api/payments/refund/${paymentId}`,
        expect.any(Object)
      )
    })
  })
})
