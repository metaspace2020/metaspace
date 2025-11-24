import { Context } from '../../../context'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { URLSearchParams } from 'url'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { UserError } from 'graphql-errors'

interface AllFeatureRequestsArgs {
  filter?: {
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
  orderBy?: 'ORDER_BY_DATE'
   | 'ORDER_BY_USER'
    | 'ORDER_BY_STATUS'
     | 'ORDER_BY_TITLE';
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
      const errorText = await response.text()
      logger.error(`API request failed with status ${response.status}: ${errorText}`)
      throw new Error(`API request failed: ${response.statusText}`)
    }

    // Handle DELETE requests that might return 204 No Content
    if (response.status === 204) {
      return { success: true }
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

  // Convert offset/limit to page/limit for API compatibility
  if (params.offset !== undefined && params.limit !== undefined) {
    const offset = Number(params.offset) || 0
    const limit = Number(params.limit) || 20
    const page = Math.floor(offset / limit) + 1
    urlParams.append('page', String(page))
    urlParams.append('limit', String(limit))
    delete params.offset
    delete params.limit
  }

  // Handle sorting order conversion
  if (params.sortingOrder) {
    params.sortingOrder = mapSortingOrderToApi(params.sortingOrder)
    // Note: The API might not support sortingOrder, but we'll pass it anyway
    urlParams.append('sortingOrder', params.sortingOrder)
    delete params.sortingOrder
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
  // User query resolvers - accessible to all authenticated users
  async myFeatureRequests(_: any, args: any, ctx: Context): Promise<any[]> {
    if (!ctx.user.id) {
      throw new UserError('Authentication required')
    }

    try {
      const response = await makeApiRequest(ctx, '/api/feature-requests/my-requests')
      return response.data || response || []
    } catch (error) {
      logger.error('Error fetching user feature requests:', error)
      return []
    }
  },

  async publicFeatureRequests(_: any, args: any, ctx: Context): Promise<any> {
    if (!ctx.user.id) {
      throw new UserError('Authentication required')
    }

    try {
      const response = await makeApiRequest(ctx, '/api/feature-requests/public')
      return response.data || {
        approved: [],
        in_backlog: [],
        in_development: [],
        implemented: [],
      }
    } catch (error) {
      logger.error('Error fetching public feature requests:', error)
      return {
        approved: [],
        in_backlog: [],
        in_development: [],
        implemented: [],
      }
    }
  },

  // Admin query resolvers - restricted to admins only
  async featureRequest(_: any, { id }: { id: string }, ctx: Context): Promise<any> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const response = await makeApiRequest(ctx, `/api/feature-requests/${id}`)
      return response.data || response || null
    } catch (error) {
      logger.error(`Error fetching feature request with ID ${id}:`, error)
      return null
    }
  },

  async allFeatureRequests(_: any, args: AllFeatureRequestsArgs, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/feature-requests${queryString}`)
      return response.data || response || []
    } catch (error) {
      logger.error('Error fetching all feature requests:', error)
      return []
    }
  },

  async featureRequestsCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/feature-requests${queryString}`)
      return result.meta?.total || result.length || 0
    } catch (error) {
      logger.error('Error fetching feature requests count:', error)
      return 0
    }
  },
}

export default QueryResolvers
