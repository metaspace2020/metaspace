import { Context } from '../../../context'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { URLSearchParams } from 'url'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { UserError } from 'graphql-errors'

interface AllSubscriptionsArgs {
  filter?: {
    userId?: string;
    planId?: string;
    isActive?: boolean;
    billingInterval?: 'monthly' | 'yearly';
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    startDate?: string;
    endDate?: string;
  };
  orderBy?: 'ORDER_BY_DATE'
   | 'ORDER_BY_USER'
    | 'ORDER_BY_PLAN'
     | 'ORDER_BY_STATUS'
      | 'ORDER_BY_BILLING_INTERVAL';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
}

interface AllTransactionsArgs {
  filter?: {
    userId?: string;
    subscriptionId?: string;
    stripePaymentIntentId?: string;
    stripeInvoiceId?: string;
    stripeSubscriptionId?: string;
    currency?: string;
    status?: string;
    type?: string;
    couponApplied?: boolean;
    startDate?: string;
    endDate?: string;
  };
  orderBy?: 'ORDER_BY_DATE'
   | 'ORDER_BY_USER'
    | 'ORDER_BY_AMOUNT'
     | 'ORDER_BY_SUBSCRIPTION'
      | 'ORDER_BY_STATUS'
       | 'ORDER_BY_TYPE';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
}

// Helper function to make API requests
export const makeApiRequest = async(ctx: Context, endpoint: string, method = 'GET', body?: any) => {
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
    }

    const response = await fetch(`${apiUrl}${endpoint}`, options)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    logger.error(`Error making API request to ${endpoint}:`, error)
    throw error
  }
}

// Convert GraphQL params to API params
const mapSortingOrderToApi = (sortingOrder: string | undefined): string => {
  return sortingOrder === 'DESCENDING' ? 'DESC' : 'ASC'
}

// Convert query parameters to URL search params
const buildQueryString = (params: Record<string, any>): string => {
  const urlParams = new URLSearchParams()

  // Convert page/limit to offset/limit for compatibility
  if (params.page && !params.offset) {
    const page = Number(params.page) || 1
    const limit = Number(params.limit) || 10
    params.offset = (page - 1) * limit
    delete params.page
  }

  // Handle sorting order conversion
  if (params.sortingOrder) {
    params.sortingOrder = mapSortingOrderToApi(params.sortingOrder)
  }

  // Process filter parameters separately to apply them at the root level
  if (params.filter && typeof params.filter === 'object') {
    const filter = params.filter
    for (const key in filter) {
      if (filter[key] !== undefined && filter[key] !== null) {
        // Add filter parameters directly to the root
        urlParams.append(key, String(filter[key]))
      }
    }
    delete params.filter
  }

  // Process all remaining parameters
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue

    if (typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === undefined || subValue === null) continue
        urlParams.append(`${key}[${subKey}]`, String(subValue))
      }
    } else {
      urlParams.append(key, String(value))
    }
  }

  const queryString = urlParams.toString()
  return queryString ? `?${queryString}` : ''
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  // Subscription query resolvers
  async subscription(_: any, { id }: { id: string }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/subscriptions/${id}`)
    } catch (error) {
      logger.error(`Error fetching subscription with ID ${id}:`, error)
      return null
    }
  },

  async allSubscriptions(_: any, args: AllSubscriptionsArgs, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/subscriptions${queryString}`)
      return response.data || response || []
    } catch (error) {
      logger.error('Error fetching all subscriptions:', error)
      return []
    }
  },

  async subscriptionsCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/subscriptions${queryString}`)
      return result.meta?.total || result.length || 0
    } catch (error) {
      logger.error('Error fetching subscriptions count:', error)
      return 0
    }
  },

  async userSubscriptions(_: any, args: any, ctx: Context): Promise<any[]> {
    if (!ctx.user.id && ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, `/api/subscriptions/user/${ctx.user.id}`)
    } catch (error) {
      logger.error(`Error fetching subscriptions for user ${ctx.user.id}:`, error)
      return []
    }
  },

  async activeUserSubscription(_: any, args: any, ctx: Context): Promise<any> {
    if (!ctx.user.id && ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, `/api/subscriptions/user/${ctx.user.id}/active`)
    } catch (error) {
      logger.error(`Error fetching active subscription for user ${ctx.user.id}:`, error)
      return null
    }
  },

  // Transaction query resolvers
  async transaction(_: any, { id }: { id: string }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/transactions/${id}`)
    } catch (error) {
      logger.error(`Error fetching transaction with ID ${id}:`, error)
      return null
    }
  },

  async allTransactions(_: any, args: AllTransactionsArgs, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/transactions${queryString}`)
      return response.data || response || []
    } catch (error) {
      logger.error('Error fetching all transactions:', error)
      return []
    }
  },

  async transactionsCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/transactions${queryString}`)
      return result.meta?.total || result.length || 0
    } catch (error) {
      logger.error('Error fetching transactions count:', error)
      return 0
    }
  },

  async userTransactions(_: any, { userId }: { userId: string }, ctx: Context): Promise<any[]> {
    // Users can only access their own transactions unless they're admin
    if (ctx.user.id !== userId && ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, `/api/transactions/user/${userId}`)
    } catch (error) {
      logger.error(`Error fetching transactions for user ${userId}:`, error)
      return []
    }
  },

  async subscriptionTransactions(_: any, { subscriptionId }: { subscriptionId: string }, ctx: Context): Promise<any[]> {
    try {
      return await makeApiRequest(ctx, `/api/transactions/subscription/${subscriptionId}`)
    } catch (error) {
      logger.error(`Error fetching transactions for subscription ${subscriptionId}:`, error)
      return []
    }
  },

  async transactionsByStatus(_: any, { status }: { status: string }, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, `/api/transactions/status/${status}`)
    } catch (error) {
      logger.error(`Error fetching transactions by status ${status}:`, error)
      return []
    }
  },

  async transactionsByType(_: any, { type }: { type: string }, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, `/api/transactions/type/${type}`)
    } catch (error) {
      logger.error(`Error fetching transactions by type ${type}:`, error)
      return []
    }
  },

  async pendingTransactions(_: any, args: any, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      return await makeApiRequest(ctx, '/api/transactions/pending')
    } catch (error) {
      logger.error('Error fetching pending transactions:', error)
      return []
    }
  },

  async transactionsByDateRange(_: any,
    {
      startDate,
      endDate,
    }:
        { startDate: string; endDate: string }, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString({ startDate, endDate })
      return await makeApiRequest(ctx, `/api/transactions/date-range${queryString}`)
    } catch (error) {
      logger.error(`Error fetching transactions by date range ${startDate} to ${endDate}:`, error)
      return []
    }
  },

  async validateCoupon(_: any,
    { input }: { input: { couponCode: string; planId: string; priceId: string } },
    ctx: Context): Promise<any> {
    try {
      const response = await makeApiRequest(ctx, '/api/subscriptions/validate-coupon', 'POST', input)
      return response
    } catch (error) {
      logger.error('Error validating coupon:', error)
      return null
    }
  },
}

export default QueryResolvers
