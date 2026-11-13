import fetch from 'node-fetch'
import config from '../../utils/config'
import logger from '../../utils/logger'
import { Context } from '../../context'

// Keeps a slow/unreachable manager service from stalling resolvers.
const REQUEST_TIMEOUT_MS = 2000

export interface SponsorshipRecord {
  id: string
  projectId: string
  proGroupId: string
  sponsorUserId: string
  entitlements: string[]
  isActive: boolean
  createdAt: string
}

export const NOT_AVAILABLE = 'Pro sponsorship is not available'

/**
 * The manager service answered with a non-2xx status. Its message comes from the response body
 * (or the status text), so it is safe to show to the user, unlike network or timeout errors.
 *
 * @example if (err instanceof ManagerApiHttpError) throw new UserError(err.message)
 */
export class ManagerApiHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ManagerApiHttpError'
  }
}

const authHeaders = (ctx: Context): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: ctx.req?.headers?.authorization || '',
})

const errorFrom = async(response: any): Promise<ManagerApiHttpError> => {
  let message: string | undefined
  try {
    const body = await response.json()
    message = body && body.message
  } catch (e) {
    // body is not JSON; fall back to the status text
  }
  return new ManagerApiHttpError(
    message || response.statusText || `Manager API request failed (${response.status})`, response.status)
}

export const getProjectSponsorship = async(ctx: Context, projectId: string): Promise<SponsorshipRecord | null> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.debug('Manager API URL is not configured')
    return null
  }
  const response = await fetch(`${apiUrl}/api/project-sponsorships/project/${encodeURIComponent(projectId)}`,
    { method: 'GET', headers: authHeaders(ctx), timeout: REQUEST_TIMEOUT_MS })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return await response.json() as SponsorshipRecord
}

export const putProjectSponsorship = async(
  ctx: Context, projectId: string, proGroupId: string, entitlementKeys: string[]
): Promise<SponsorshipRecord> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    throw new Error(NOT_AVAILABLE)
  }
  const response = await fetch(`${apiUrl}/api/project-sponsorships/project/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: authHeaders(ctx),
    body: JSON.stringify({ proGroupId, entitlements: entitlementKeys }),
    timeout: REQUEST_TIMEOUT_MS,
  })
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return await response.json() as SponsorshipRecord
}

export const deleteProjectSponsorship = async(ctx: Context, projectId: string): Promise<boolean> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    throw new Error(NOT_AVAILABLE)
  }
  const response = await fetch(`${apiUrl}/api/project-sponsorships/project/${encodeURIComponent(projectId)}`,
    { method: 'DELETE', headers: authHeaders(ctx), timeout: REQUEST_TIMEOUT_MS })
  if (!response.ok && response.status !== 404) {
    throw await errorFrom(response)
  }
  return true
}

export const deleteSponsorshipsBySponsor = async(
  ctx: Context, userId: string, proGroupId: string
): Promise<number> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.error('Manager API URL is not configured')
    return 0
  }
  try {
    const response = await fetch(
      `${apiUrl}/api/project-sponsorships/by-sponsor?userId=${encodeURIComponent(userId)}`
        + `&proGroupId=${encodeURIComponent(proGroupId)}`,
      { method: 'DELETE', headers: authHeaders(ctx), timeout: REQUEST_TIMEOUT_MS }
    )
    if (!response.ok) {
      logger.error(`Removing sponsorships by sponsor failed with status ${response.status}`)
      return 0
    }
    const data = await response.json()
    return typeof data.removed === 'number' ? data.removed : 0
  } catch (error) {
    logger.error('Error removing sponsorships by sponsor:', error)
    return 0
  }
}

/**
 * Checks whether a group has an active Pro subscription in the manager service.
 * Calls the same endpoint as `activeUserSubscription`. Never throws.
 *
 * @param ctx - request context; its Authorization header is forwarded
 * @param groupId - group to check
 * @returns true when the service answers 2xx with a non-empty subscription body (bare or wrapped in `{ data }`);
 *   false on non-2xx, an empty or non-JSON body, a network error, or when `manager_api_url` is unset
 * @example await groupHasActiveSubscription(ctx, group.id) // true
 */
export const groupHasActiveSubscription = async(ctx: Context, groupId: string): Promise<boolean> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.debug('Manager API URL is not configured')
    return false
  }
  try {
    const response = await fetch(`${apiUrl}/api/subscriptions/group/${encodeURIComponent(groupId)}/active`,
      { method: 'GET', headers: authHeaders(ctx), timeout: REQUEST_TIMEOUT_MS })
    if (!response.ok) {
      return false
    }
    const body = await response.json()
    const subscription = body != null && typeof body === 'object' && 'data' in body ? body.data : body
    return subscription != null && typeof subscription === 'object' && Object.keys(subscription).length > 0
  } catch (error) {
    logger.warn(`Checking active subscription for group ${groupId} failed: ${error}`)
    return false
  }
}
