import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'
import logger from '../../../utils/logger'
import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'

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
  createSubscription: async(_, args, ctx: Context) => {
    try {
      const { input } = args

      // Transform the input to match external API expectations
      const apiInput: any = {
        userId: input.userId,
        planId: input.planId,
        priceId: input.priceId,
        email: input.email,
        name: input.name,
        billingInterval: input.billingInterval,
        paymentMethodId: input.paymentMethodId,
      }

      // Include optional group fields if provided
      if (input.groupId) {
        apiInput.groupId = input.groupId
      }
      if (input.groupName) {
        apiInput.groupName = input.groupName
      }

      // Only include couponCode if it's not null/empty
      if (input.couponCode && input.couponCode.trim()) {
        apiInput.couponCode = input.couponCode.trim()
      }

      const result = await makeApiRequest(ctx, '/api/subscriptions', 'POST', apiInput)
      return result.subscription // Return just the subscription object
    } catch (error) {
      throw new UserError('Failed to create subscription')
    }
  },

  updateSubscription: async(_, args, ctx: Context) => {
    try {
      const { id, input } = args
      const result = await makeApiRequest(ctx, `/api/subscriptions/${id}`, 'PUT', input)
      return result.subscription
    } catch (error) {
      throw new UserError('Failed to update subscription')
    }
  },

  cancelSubscription: async(_, args, ctx: Context) => {
    try {
      const { id, input } = args
      const result = await makeApiRequest(ctx, `/api/subscriptions/${id}/cancel`, 'PUT', input)
      return result.subscription
    } catch (error) {
      throw new UserError('Failed to cancel subscription')
    }
  },
}

export default MutationResolvers
