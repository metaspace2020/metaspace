import fetch from 'node-fetch'
import config from '../../../utils/config'
import logger from '../../../utils/logger'

// Timeout keeps a slow/unreachable manager service from stalling the resolver;
// callers fail closed (the download stays blocked) instead.
const REQUEST_TIMEOUT_MS = 2000

// Atomically consumes one usage credit on the manager service. Returns true only when
// a credit was actually decremented; every failure mode returns false so an outage
// never grants free downloads. No retries — retrying could double-spend.
export const consumeUsageCredit = async(
  userId: string, actionType: string, type: string
): Promise<boolean> => {
  const apiUrl = config.manager_api_url
  if (!apiUrl) {
    logger.error('Manager API URL is not configured')
    return false
  }
  try {
    const response = await fetch(`${apiUrl}/api/usage-credits/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, actionType, type }),
      timeout: REQUEST_TIMEOUT_MS,
    })
    if (!response.ok) {
      if (response.status !== 403) {
        logger.error(`Usage credit consume failed with status ${response.status}`)
      }
      return false
    }
    const data = await response.json()
    return data.consumed === true
  } catch (error) {
    logger.error('Error consuming usage credit:', error)
    return false
  }
}
