import { Context } from '../../../context'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { URLSearchParams } from 'url'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'

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

// Convert GraphQL params to API params for location endpoints
const mapLocationOrderByToApi = (orderBy: string | undefined): string => {
  if (!orderBy) return 'name'

  const mapping: Record<string, string> = {
    NAME: 'name',
    CODE: 'code',
    CREATED_AT: 'createdAt',
    UPDATED_AT: 'updatedAt',
  }

  return mapping[orderBy] || 'name'
}

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

  // Handle location orderBy conversion
  if (params.orderBy && ['NAME', 'CODE', 'CREATED_AT', 'UPDATED_AT'].includes(params.orderBy)) {
    params.orderBy = mapLocationOrderByToApi(params.orderBy)
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
  // Order query resolvers
  async order(_: any, { id }: { id: number }, ctx: Context): Promise<any> {
    try {
      const includePayments = ctx.req?.query?.includePayments === 'true'
      const queryString = includePayments ? '?includePayments=true' : ''
      return await makeApiRequest(ctx, `/api/orders/${id}${queryString}`)
    } catch (error) {
      logger.error(`Error fetching order with ID ${id}:`, error)
      return null
    }
  },

  async allOrders(_: any, args, ctx: Context): Promise<any[]> {
    try {
      const { filter, orderBy, sortingOrder, page, limit } = args
      const queryString = buildQueryString({ ...filter, orderBy, sortingOrder, page, limit })
      const response = await makeApiRequest(ctx, `/api/orders${queryString}`)
      return response.data || []
    } catch (error) {
      logger.error('Error fetching all orders:', error)
      return []
    }
  },

  async ordersCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/orders${queryString}`)
      return result.meta?.total || 0
    } catch (error) {
      logger.error('Error fetching orders count:', error)
      return 0
    }
  },

  // Payment query resolvers
  async payment(_: any, { id }: { id: number }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/payments/${id}`)
    } catch (error) {
      logger.error(`Error fetching payment with ID ${id}:`, error)
      return null
    }
  },

  async allPayments(_: any, args, ctx: Context): Promise<any[]> {
    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/payments${queryString}`)
      return response.data || []
    } catch (error) {
      logger.error('Error fetching all payments:', error)
      return []
    }
  },

  async paymentsCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString({ ...filter })
      const result = await makeApiRequest(ctx, `/api/payments${queryString}`)
      return result.meta?.total || 0
    } catch (error) {
      logger.error('Error fetching payments count:', error)
      return 0
    }
  },

  // Country query resolvers
  async country(_: any, { id }: { id: string }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/location/countries/${id}`)
    } catch (error) {
      logger.error(`Error fetching country with ID ${id}:`, error)
      return null
    }
  },

  async allCountries(_: any, args, ctx: Context): Promise<any[]> {
    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/location/countries${queryString}`)
      return response.data || []
    } catch (error) {
      logger.error('Error fetching all countries:', error)
      return []
    }
  },

  async countriesCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/location/countries${queryString}`)
      return result.total || 0
    } catch (error) {
      logger.error('Error fetching countries count:', error)
      return 0
    }
  },

  // State query resolvers
  async state(_: any, { id }: { id: string }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/location/states/${id}`)
    } catch (error) {
      logger.error(`Error fetching state with ID ${id}:`, error)
      return null
    }
  },

  async allStates(_: any, args, ctx: Context): Promise<any[]> {
    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/location/states${queryString}`)
      return response.data || []
    } catch (error) {
      logger.error('Error fetching all states:', error)
      return []
    }
  },

  async statesCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/location/states${queryString}`)
      return result.total || 0
    } catch (error) {
      logger.error('Error fetching states count:', error)
      return 0
    }
  },
}

export default QueryResolvers
