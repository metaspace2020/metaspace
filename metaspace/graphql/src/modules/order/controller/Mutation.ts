import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'

// Order interfaces
interface CreateOrderInput {
  userId: string;
  planId?: number;
  orderId: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  type: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    name: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  metadata?: Record<string, any>;
  billingAddress?: string;
  billingCity?: string;
  billingPostalCode?: string;
  billingCountryId?: number;
  billingStateId?: number;
}

interface UpdateOrderInput {
  status?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  metadata?: Record<string, any>;
}

// Payment interfaces
interface CreatePaymentInput {
  orderId: number;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: 'credit_card' | 'paypal' | 'bank_transfer' | 'other';
  status: 'succeeded' | 'authorized' | 'failed' | 'pending' | 'refunded';
  type: string;
  stripeChargeId: string;
  externalReference?: string;
  metadata?: Record<string, any>;
}

interface UpdatePaymentInput {
  status?: 'succeeded' | 'authorized' | 'failed' | 'pending' | 'refunded';
  metadata?: Record<string, any>;
}

interface RefundPaymentInput {
  amount?: number;
  reason?: string;
}

// Helper function to make API requests
const makeApiRequest = async(ctx: Context, endpoint: string, method = 'GET', body?: any) => {
  try {
    const apiUrl = config.manager_api_url
    const token = ctx.req?.headers?.authorization || ''

    if (!apiUrl) {
      logger.error('Manager API URL is not configured')
      throw new Error('Manager API URL is not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers.Authorization = token
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
      logger.info(`Request to ${endpoint}:`, { method, body })
    }

    const response = await fetch(`${apiUrl}${endpoint}`, options)
    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`API request failed with status ${response.status}: ${errorText}`)
      throw new Error(`API request failed: ${response.statusText}`)
    }

    if (method === 'DELETE') {
      return { success: true }
    }

    const responseData = await response.json()
    logger.info(`Response from ${endpoint}:`, responseData)
    return responseData
  } catch (error) {
    logger.error(`Error making API request to ${endpoint}:`, error)
    throw error
  }
}

// Define the MutationResolvers type with the specific methods we're implementing
interface MutationResolvers {
  createOrder: (_: any, args: { input: CreateOrderInput }, ctx: Context) => Promise<any>;
  updateOrder: (_: any, args: { id: number, input: UpdateOrderInput }, ctx: Context) => Promise<any>;
  deleteOrder: (_: any, args: { id: number }, ctx: Context) => Promise<boolean>;
  createPayment: (_: any, args: { input: CreatePaymentInput }, ctx: Context) => Promise<any>;
  updatePayment: (_: any, args: { id: number, input: UpdatePaymentInput }, ctx: Context) => Promise<any>;
  deletePayment: (_: any, args: { id: number }, ctx: Context) => Promise<boolean>;
  refundPayment: (_: any, args: { id: number, input: RefundPaymentInput }, ctx: Context) => Promise<any>;
}

const MutationResolvers: MutationResolvers = {
  // Order mutation resolvers
  async createOrder(_: any, { input }: { input: CreateOrderInput }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, '/api/orders', 'POST', input)
    } catch (error) {
      logger.error('Error creating order:', error)
      throw new UserError('Failed to create order')
    }
  },

  async updateOrder(_: any, { id, input }: { id: number, input: UpdateOrderInput }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/orders/${id}`, 'PUT', input)
    } catch (error) {
      logger.error(`Error updating order with ID ${id}:`, error)
      throw new UserError('Failed to update order')
    }
  },

  async deleteOrder(_: any, { id }: { id: number }, ctx: Context): Promise<boolean> {
    try {
      await makeApiRequest(ctx, `/api/orders/${id}`, 'DELETE')
      return true
    } catch (error) {
      logger.error(`Error deleting order with ID ${id}:`, error)
      throw new UserError('Failed to delete order')
    }
  },

  // Payment mutation resolvers
  async createPayment(_: any, { input }: { input: CreatePaymentInput }, ctx: Context): Promise<any> {
    try {
      const apiResponse = await makeApiRequest(ctx, '/api/payments', 'POST', input)

      // Map the API response to match our GraphQL schema
      // This ensures all required fields from our GraphQL schema are present
      const graphqlResponse = {
        ...apiResponse,
        // Add fields that are required in our GraphQL schema but not returned by the API
        userId: input.userId, // Use the userId from the input since the API doesn't return it
      }

      logger.info('Mapped payment response:', graphqlResponse)

      return graphqlResponse
    } catch (error) {
      logger.error('Error creating payment:', error)
      throw new UserError('Failed to create payment')
    }
  },

  async updatePayment(_: any, { id, input }: { id: number, input: UpdatePaymentInput }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/payments/${id}`, 'PUT', input)
    } catch (error) {
      logger.error(`Error updating payment with ID ${id}:`, error)
      throw new UserError('Failed to update payment')
    }
  },

  async deletePayment(_: any, { id }: { id: number }, ctx: Context): Promise<boolean> {
    try {
      await makeApiRequest(ctx, `/api/payments/${id}`, 'DELETE')
      return true
    } catch (error) {
      logger.error(`Error deleting payment with ID ${id}:`, error)
      throw new UserError('Failed to delete payment')
    }
  },

  async refundPayment(_: any, { id, input }: { id: number, input: RefundPaymentInput }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/payments/refund/${id}`, 'POST', input)
    } catch (error) {
      logger.error(`Error refunding payment with ID ${id}:`, error)
      throw new UserError('Failed to refund payment')
    }
  },
}

export default MutationResolvers
