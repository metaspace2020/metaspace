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

    // Handle DELETE requests that return 204 No Content
    if (method === 'DELETE' || response.status === 204) {
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
  // User mutations - accessible to all authenticated users
  createFeatureRequest: async(_, args, ctx: Context) => {
    if (!ctx.user.id) {
      throw new UserError('Authentication required')
    }

    try {
      const { input } = args

      // Validate input
      if (!input.title || !input.title.trim()) {
        throw new UserError('Title is required')
      }

      if (!input.description || !input.description.trim()) {
        throw new UserError('Description is required')
      }

      const apiInput = {
        title: input.title.trim(),
        description: input.description.trim(),
      }

      const result = await makeApiRequest(ctx, '/api/feature-requests', 'POST', apiInput)
      return result.data || result
    } catch (error) {
      if (error instanceof UserError) {
        throw error
      }
      logger.error('Error creating feature request:', error)
      throw new UserError('Failed to create feature request')
    }
  },

  // Admin mutations - restricted to admins only
  approveFeatureRequest: async(_, args, ctx: Context) => {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const { id, input } = args

      const apiInput: any = {}
      if (input?.adminNotes) {
        apiInput.adminNotes = input.adminNotes
      }

      const result = await makeApiRequest(ctx, `/api/feature-requests/${id}/approve`, 'PUT', apiInput)
      return result.data || result
    } catch (error) {
      logger.error('Error approving feature request:', error)
      throw new UserError('Failed to approve feature request')
    }
  },

  rejectFeatureRequest: async(_, args, ctx: Context) => {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const { id, input } = args

      // Validate that adminNotes is provided
      if (!input.adminNotes || !input.adminNotes.trim()) {
        throw new UserError('Admin notes are required when rejecting a feature request')
      }

      const apiInput = {
        adminNotes: input.adminNotes.trim(),
      }

      const result = await makeApiRequest(ctx, `/api/feature-requests/${id}/reject`, 'PUT', apiInput)
      return result.data || result
    } catch (error) {
      if (error instanceof UserError) {
        throw error
      }
      logger.error('Error rejecting feature request:', error)
      throw new UserError('Failed to reject feature request')
    }
  },

  updateFeatureRequestStatus: async(_, args, ctx: Context) => {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const { id, input } = args

      // Validate that status is provided
      if (!input.status) {
        throw new UserError('Status is required')
      }

      const apiInput: any = {
        status: input.status,
      }

      if (input.adminNotes) {
        apiInput.adminNotes = input.adminNotes
      }

      const result = await makeApiRequest(ctx, `/api/feature-requests/${id}/status`, 'PUT', apiInput)
      return result.data || result
    } catch (error) {
      if (error instanceof UserError) {
        throw error
      }
      logger.error('Error updating feature request status:', error)
      throw new UserError('Failed to update feature request status')
    }
  },

  deleteFeatureRequest: async(_, args, ctx: Context) => {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    try {
      const { id } = args
      await makeApiRequest(ctx, `/api/feature-requests/${id}`, 'DELETE')
      return true
    } catch (error) {
      logger.error('Error deleting feature request:', error)
      throw new UserError('Failed to delete feature request')
    }
  },
}

export default MutationResolvers
