const RATE_LIMIT_WINDOW = 24 * 60 * 60 // 24 hours in seconds
const RATE_LIMIT_COUNT = 2

/** Promisify one node_redis v3 callback-style command */
const redisCall = <T>(redisClient: any, command: string, ...args: any[]) =>
  new Promise<T>((resolve, reject) => {
    redisClient[command](...args, (err: any, res: T) => (err ? reject(err) : resolve(res)))
  })

/**
 * Sliding window log per IP: a sorted set of allowed download timestamps (ms). A call is refused
 * when the window already holds `rateLimitCount` downloads. Refused attempts are not recorded,
 * each download stops counting 24h after it happened, and the set never exceeds the limit.
 * The key name differs from the old string counter so stale keys cannot cause WRONGTYPE errors.
 */
export default async function isRateLimited(redisClient: any, ip: string,
  rateLimitCount: number = RATE_LIMIT_COUNT): Promise<boolean> {
  const key = `rate_limit:downloadLinkJson:log:${ip}`
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW * 1000

  await redisCall(redisClient, 'zremrangebyscore', key, '-inf', windowStart)
  const downloadsInWindow = await redisCall<number>(redisClient, 'zcard', key)

  if (downloadsInWindow >= rateLimitCount) {
    return true
  }

  await redisCall(redisClient, 'zadd', key, now, `${now}:${Math.random().toString(36).slice(2)}`)
  await redisCall(redisClient, 'expire', key, RATE_LIMIT_WINDOW)
  return false
}
