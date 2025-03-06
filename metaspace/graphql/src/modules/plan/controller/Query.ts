import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { URLSearchParams } from 'url'

interface AllPlansArgs {
  filter?: {
    name?: string
    isActive?: boolean
    isDefault?: boolean
    createdAt?: string
    price?: number
    order?: number
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_NAME' | 'ORDER_BY_ACTIVE' |
  'ORDER_BY_DEFAULT' | 'ORDER_BY_PRICE' | 'ORDER_BY_ORDER' | 'ORDER_BY_SORT';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number
  limit?: number
}

interface AllPlanRulesArgs {
  planId?: number;
  filter?: {
    actionType?: string;
    type?: string;
    visibility?: string;
    source?: string;
    createdAt?: string;
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_ACTION_TYPE' | 'ORDER_BY_TYPE' | 'ORDER_BY_VISIBILITY' |
   'ORDER_BY_SOURCE' | 'ORDER_BY_PLAN';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
}

interface AllApiUsagesArgs {
  filter?: {
    userId?: string;
    datasetId?: string;
    projectId?: string;
    groupId?: string;
    actionType?: string;
    type?: string;
    source?: string;
    canEdit?: boolean;
    startDate?: string;
    endDate?: string;
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_USER' | 'ORDER_BY_ACTION_TYPE' | 'ORDER_BY_TYPE' | 'ORDER_BY_SOURCE';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
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
    }

    const response = await fetch(`${apiUrl}${endpoint}`, options)
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    throw error
  }
}

// Convert query parameters to URL search params
const buildQueryString = (params: Record<string, any>): string => {
  const urlParams = new URLSearchParams()

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
  async plan(_: any, { id }: { id: number }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/plans/${id}`)
    } catch (error) {
      logger.error(`Error fetching plan with ID ${id}:`, error)
      return null
    }
  },

  async allPlans(_: any, args: AllPlansArgs, ctx: Context): Promise<any[]> {
    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/plans${queryString}`)
      const plans = response.data
      return plans
    } catch (error) {
      logger.error('Error fetching all plans:', error)
      return []
    }
  },

  async plansCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString({ filter })
      const result = await makeApiRequest(ctx, `/api/plans${queryString}`)
      return result.meta?.total || 0
    } catch (error) {
      logger.error('Error fetching plans count:', error)
      return 0
    }
  },

  async planRule(_: any, { id }: { id: number }, ctx: Context): Promise<any> {
    try {
      return await makeApiRequest(ctx, `/api/plan-rules/${id}`)
    } catch (error) {
      logger.error(`Error fetching plan rule with ID ${id}:`, error)
      return null
    }
  },

  async allPlanRules(_: any, args: AllPlanRulesArgs, ctx: Context): Promise<any[]> {
    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/plan-rules${queryString}`)
      const planRules = response.data
      return planRules
    } catch (error) {
      logger.error('Error fetching all plan rules:', error)
      return []
    }
  },

  async planRulesCount(_: any, args: AllPlanRulesArgs, ctx: Context): Promise<number> {
    try {
      const queryString = buildQueryString(args)
      const result = await makeApiRequest(ctx, `/api/plan-rules${queryString}`)
      return result.meta?.total || 0
    } catch (error) {
      logger.error('Error fetching plan rules count:', error)
      return 0
    }
  },

  async allApiUsages(_: any, args: AllApiUsagesArgs, ctx: Context): Promise<any[]> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString(args)
      const response = await makeApiRequest(ctx, `/api/api-usages${queryString}`)
      const apiUsages = response.data
      return apiUsages
    } catch (error) {
      logger.error('Error fetching all API usages:', error)
      return []
    }
  },

  async apiUsagesCount(_: any, args: AllApiUsagesArgs, ctx: Context): Promise<number> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    try {
      const queryString = buildQueryString(args)
      const result = await makeApiRequest(ctx, `/api/api-usages${queryString}`)
      return result.meta?.total || 0
    } catch (error) {
      logger.error('Error fetching API usages count:', error)
      return 0
    }
  },
}

export default QueryResolvers
