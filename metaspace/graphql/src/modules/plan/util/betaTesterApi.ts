import fetch from 'node-fetch'
import { URL, URLSearchParams } from 'url'
import config from '../../../utils/config'
import logger from '../../../utils/logger'

// Timeout keeps a slow/unreachable manager service from stalling resolvers;
// callers fail closed (no beta features) instead.
const REQUEST_TIMEOUT_MS = 2000

export const fetchBetaFeatures = async(userId: string): Promise<string[]> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.error('Manager API URL is not configured')
    return []
  }
  try {
    const response = await fetch(
      `${apiUrl}/api/beta-testers/is-allowed?userId=${encodeURIComponent(userId)}`,
      { timeout: REQUEST_TIMEOUT_MS }
    )
    if (!response.ok) {
      logger.error(`Beta tester feature lookup failed with status ${response.status}`)
      return []
    }
    const data = await response.json()
    return Array.isArray(data.features) ? data.features : []
  } catch (error) {
    logger.error('Error fetching beta tester features:', error)
    return []
  }
}

export type BetaActivationOutcome = 'success' | 'already-active' | 'invalid'

export interface BetaActivationOverrides {
  features?: string
  startDate?: string
  endDate?: string
}

export const activateBetaTesterToken = async(
  token: string, overrides: BetaActivationOverrides = {}
): Promise<BetaActivationOutcome> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.error('Manager API URL is not configured')
    return 'invalid'
  }
  const params = new URLSearchParams()
  if (overrides.features) {
    params.append('features', overrides.features)
  }
  if (overrides.startDate) {
    params.append('startDate', overrides.startDate)
  }
  if (overrides.endDate) {
    params.append('endDate', overrides.endDate)
  }
  const query = params.toString()
  try {
    const response = await fetch(
      `${apiUrl}/api/beta-testers/activate/${encodeURIComponent(token)}${query ? `?${query}` : ''}`,
      { redirect: 'manual', timeout: REQUEST_TIMEOUT_MS }
    )
    // The manager answers with a 302 to {web_public_url}?betaActivation=<outcome>;
    // read the outcome from the Location header instead of following the redirect.
    const location = response.headers.get('location')
    if (response.status !== 302 || !location) {
      logger.error(`Beta tester activation failed with status ${response.status}`)
      return 'invalid'
    }
    const outcome = new URL(location).searchParams.get('betaActivation')
    return outcome === 'success' || outcome === 'already-active' ? outcome : 'invalid'
  } catch (error) {
    logger.error('Error activating beta tester token:', error)
    return 'invalid'
  }
}
