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

    // A server error is an outage of the manager API, not a policy decision
    if (response.status >= 500) {
      logger.error(`Manager API returned ${response.status}, allowing action to proceed`)
      return { allowed: true }
    }

    if (!response.ok) {
      return { allowed: false, message: data.message }
    }

    // If the response is successful, return the 'allowed' value
    return { allowed: data.allowed === true, message: data.message }
  } catch (error) {
    logger.error('Error checking action permission, manager API unavailable, allowing action to proceed:', error)
    return { allowed: true }
  }
}

export const performAction = async(ctx: Context, action: any) : Promise<any|null> => {
  const token = ctx.req?.headers?.authorization || ''
  const apiUrl = config.manager_api_url

  if (!apiUrl) {
    logger.error('Manager API URL is not configured')
    return {}
  }

  if (ctx.isAdmin) {
    return {}
  }

  let response
  try {
    response = await fetch(`${apiUrl}/api/api-usages/`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    })
  } catch (error) {
    logger.error('Error performing action, manager API unavailable, allowing action to proceed:', error)
    return {}
  }

  // A server error is an outage of the manager API — fail open as well
  if (response.status >= 500) {
    logger.error(`Manager API returned ${response.status}, allowing action to proceed`)
    return {}
  }

  if (!response.ok) {
    throw new Error(`Failed to perform action: ${response.statusText}`)
  }

  const data = await response.json()
  return data
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
