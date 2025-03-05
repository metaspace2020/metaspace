import { Context } from '../../../context'
import { ApiUsage } from '../model'
import { DeepPartial } from 'typeorm'
import { UserError } from 'graphql-errors'
import { UAParser } from 'ua-parser-js'
import * as CryptoJS from 'crypto-js'
import config from '../../../utils/config'
import fetch from 'node-fetch'

const canPerformAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<boolean> => {
  try {
    const user: any = ctx?.user
    const apiUrl = config.manager_api_url
    const token = ctx.req?.headers?.authorization || ''

    if (user?.role === 'admin') {
      return true
    }

    if (!apiUrl) {
      console.log('Manager API URL is not configured')
      return true
    }

    const response = await fetch(`${apiUrl}/api/api-usages/is-allowed`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    // If the response is successful, return the 'allowed' value
    return data.allowed === true
  } catch (error) {
    // If there's an error or the response indicates not allowed, return false
    console.error('Error checking action permission:', error)
    return false
  }
}

export const performAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<ApiUsage> => {
  try {
    const token = ctx.req?.headers?.authorization || ''
    const apiUrl = config.manager_api_url

    if (!apiUrl) {
      console.log('Manager API URL is not configured')
      return {} as ApiUsage
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
    console.error('Error performing action:', error)
    throw error
  }
}

export const assertCanPerformAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<void> => {
  const canPerform = await canPerformAction(ctx, action)
  if (!canPerform) {
    throw new UserError('Limit reached')
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
