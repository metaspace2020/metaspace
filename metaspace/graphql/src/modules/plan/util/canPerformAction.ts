import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import { UAParser } from 'ua-parser-js'
import * as CryptoJS from 'crypto-js'
import config from '../../../utils/config'
import fetch from 'node-fetch'
import logger from '../../../utils/logger'

interface CanPerformResult {
  allowed: boolean
  message?: string
}

const canPerformAction = async(ctx: Context, action: any) : Promise<CanPerformResult> => {
  try {
    const user: any = ctx?.user
    const apiUrl = config.manager_api_url
    const token = ctx.req?.headers?.authorization || ''

    if (user?.role === 'admin') {
      return { allowed: true }
    }

    if (!apiUrl) {
      logger.error('Manager API URL is not configured')
      return { allowed: true }
    }

    const response = await fetch(`${apiUrl}/api/api-usages/is-allowed`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    })

    const data = await response.json()

    if (!response.ok) {
      return { allowed: false, message: data.message }
    }

    // If the response is successful, return the 'allowed' value
    return { allowed: data.allowed === true, message: data.message }
  } catch (error) {
    // If the service is down (connection error), return true to allow the action
    // This ensures operations can continue when the external service is unavailable
    logger.error('Error checking action permission:', error)

    // Check if it's a connection error (service down)
    // Safe type check without relying on catch clause type annotation
    if (typeof error === 'object' && error !== null
        && (('code' in error
          && ((error).code === 'ECONNREFUSED'
           || (error).code === 'ENOTFOUND'
           || (error).code === 'ETIMEDOUT'))
         || (error instanceof Error && error.message?.includes('Failed to fetch')))) {
      logger.error('Manager API appears to be down, allowing action to proceed')
      return { allowed: true }
    }

    // For other types of errors, still return false
    return { allowed: false, message: 'Error checking permissions' }
  }
}

export const performAction = async(ctx: Context, action: any) : Promise<any|null> => {
  try {
    const token = ctx.req?.headers?.authorization || ''
    const apiUrl = config.manager_api_url

    if (!apiUrl) {
      logger.error('Manager API URL is not configured')
      return {}
    }

    const response = await fetch(`${apiUrl}/api/api-usages/`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    })
    if (!response.ok) {
      throw new Error(`Failed to perform action: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    // Check if it's a connection error (service down)
    if (typeof error === 'object' && error !== null
        && (('code' in error
          && ((error).code === 'ECONNREFUSED'
           || (error).code === 'ENOTFOUND'
           || (error).code === 'ETIMEDOUT'))
         || (error instanceof Error && error.message?.includes('Failed to fetch')))) {
      logger.error('Manager API appears to be down, allowing action to proceed')
      return {}
    }

    // For other types of errors, still throw
    throw error
  }
}

export const assertCanPerformAction = async(ctx: Context, action: any) : Promise<void> => {
  const result = await canPerformAction(ctx, action)
  if (!result.allowed) {
    throw new UserError(result.message || 'Limit reached')
  }
}

export const getDeviceInfo = (userAgent: string | undefined, email: string | null = null) => {
  try {
    const { browser, os, device } = UAParser(userAgent)
    return JSON.stringify({
      device,
      os,
      browser,
      email,
    })
  } catch (error) {
    return JSON.stringify({})
  }
}

export const hashIp = (ip: string|undefined): string|undefined => {
  if (!ip) return undefined
  const saltedIP = config.api.usage.salt + ip
  return CryptoJS.SHA256(saltedIP).toString(CryptoJS.enc.Hex)
}

export default canPerformAction
