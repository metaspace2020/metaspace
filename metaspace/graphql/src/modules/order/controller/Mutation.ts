import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { updateUserPlan } from '../../user/controller'

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
      const errorText = response.text ? await response.text() : 'Internal server error'
      logger.error(`API request failed with status ${response.status}: ${errorText}`)
      throw new Error(errorText)
    }

    if (method === 'DELETE') {
      return { success: true }
    }

    const responseData = await response.json()
    return responseData
  } catch (error) {
    logger.error(`Error making API request to ${endpoint}:`, error)
    throw error
  }
}

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  createOrder: async(_, args, ctx: Context) => {
    try {
      const { input } = args
      return await makeApiRequest(ctx, '/api/orders', 'POST', input)
    } catch (error) {
      throw new UserError('Failed to create order')
    }
  },

  updateOrder: async(_, args, ctx: Context) => {
    try {
      const { id, input } = args
      return await makeApiRequest(ctx, `/api/orders/${id}`, 'PUT', input)
    } catch (error) {
      throw new UserError('Failed to update order')
    }
  },

  async deleteOrder(_: any, { id }: { id: number }, ctx: Context): Promise<boolean> {
    try {
      await makeApiRequest(ctx, `/api/orders/${id}`, 'DELETE')
      return true
    } catch (error) {
      throw new UserError('Failed to delete order')
    }
  },

  createPayment: async(_, args, ctx: Context) => {
    try {
      const { input } = args
      const apiResponse = await makeApiRequest(ctx, '/api/payments', 'POST', input)

      const graphqlResponse = {
        ...apiResponse,
        userId: input.userId,
      }

      if (apiResponse.status === 'succeeded') {
        await updateUserPlan(ctx, input.userId, apiResponse?.metadata?.planId || 1)
      }

      return graphqlResponse
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      throw new UserError(errorMessage)
    }
  },

  updatePayment: async(_, args, ctx: Context) => {
    const { id, input } = args

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

  async refundPayment(_: any, args, ctx: Context): Promise<any> {
    const { id, input } = args

    try {
      return await makeApiRequest(ctx, `/api/payments/refund/${id}`, 'POST', input)
    } catch (error) {
      logger.error(`Error refunding payment with ID ${id}:`, error)
      throw new UserError('Failed to refund payment')
    }
  },
}

export default MutationResolvers
