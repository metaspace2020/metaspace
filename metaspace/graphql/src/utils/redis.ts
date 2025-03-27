import * as moment from 'moment'

const RATE_LIMIT_WINDOW = 24 * 60 * 60 // 24 hours in seconds
const RATE_LIMIT_COUNT = 2

export default async function isRateLimited(redisClient: any, ip: string,
  rateLimitCount: number = RATE_LIMIT_COUNT): Promise<boolean> {
  const key = `rate_limit:downloadLinkJson:${ip}`

  // Get the current value from Redis
  const storedValue = await new Promise<string | null>((resolve, reject) => {
    redisClient.get(key, (err: any, res: string | null) => {
      if (err) {
        reject(err)
      }
      resolve(res)
    })
  })

  const currentTime = moment().utc()

  if (!storedValue) {
    // Key doesn't exist, initialize the counter
    await new Promise<void>((resolve, reject) => {
      redisClient.set(key, '1', 'EX', RATE_LIMIT_WINDOW, (err: any) => {
        if (err) {
          reject(err)
        }
        resolve()
      })
    })
    return false // Not rate-limited
  }

  // Check if the stored value is a timestamp (indicating the limit was reached)
  if (moment(storedValue, moment.ISO_8601, true).isValid()) {
    const limitReachedAt = moment(storedValue)
    const elapsedTime = currentTime.diff(limitReachedAt, 'seconds')

    if (elapsedTime < RATE_LIMIT_WINDOW) {
      return true // Rate-limited
    }

    // If the window has passed, reset the limit
    await new Promise<void>((resolve, reject) => {
      redisClient.set(key, '1', 'EX', RATE_LIMIT_WINDOW, (err: any) => {
        if (err) {
          reject(err)
        }
        resolve()
      })
    })
    return false // Not rate-limited
  }

  // Increment the counter
  const currentCount = parseInt(storedValue, 10) + 1

  if (currentCount > rateLimitCount) {
    // Store the timestamp when the rate limit is reached
    await new Promise<void>((resolve, reject) => {
      redisClient.set(key, currentTime.toISOString(), 'EX', RATE_LIMIT_WINDOW, (err: any) => {
        if (err) {
          reject(err)
        }
        resolve()
      })
    })
    return true // Rate-limited
  }

  // Update the counter
  await new Promise<void>((resolve, reject) => {
    redisClient.set(key, currentCount.toString(), 'XX', (err: any) => {
      if (err) {
        reject(err)
      }
      resolve()
    })
  })

  return false // Not rate-limited
}
