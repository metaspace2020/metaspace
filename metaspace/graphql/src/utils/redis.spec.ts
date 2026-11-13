import isRateLimited from './redis'

const DAY = 24 * 60 * 60
const IP = '1.2.3.4'
const KEY = `rate_limit:downloadLinkJson:log:${IP}`

interface SortedSet { members: Map<string, number>, expiresAt: number | null }
type Callback = (err: any, res: any) => void

/** Wall clock seen by the code under test and by the fake Redis; advanced by FakeRedis.advanceTo */
let clock = 0
beforeEach(() => {
  jest.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  jest.restoreAllMocks()
})

/**
 * Stand-in for the node_redis v3 callback client used by connect-redis, covering the sorted-set
 * commands a sliding window log needs. Time is driven by the test instead of the wall clock.
 */
class FakeRedis {
  private store = new Map<string, SortedSet>()
  private now: number

  constructor(now: Date) {
    this.now = now.getTime()
    clock = this.now
  }

  advanceTo(date: Date) {
    this.now = date.getTime()
    clock = this.now
  }

  zadd(key: string, score: number, member: string, cb: Callback) {
    const set = this.live(key) ?? { members: new Map(), expiresAt: null }
    set.members.set(member, score)
    this.store.set(key, set)
    cb(null, 1)
  }

  zremrangebyscore(key: string, min: string | number, max: string | number, cb: Callback) {
    const set = this.live(key)
    let removed = 0
    if (set) {
      const lo = min === '-inf' ? -Infinity : Number(min)
      const hi = max === '+inf' ? Infinity : Number(max)
      for (const [member, score] of set.members) {
        if (score >= lo && score <= hi) {
          set.members.delete(member)
          removed++
        }
      }
    }
    cb(null, removed)
  }

  zcard(key: string, cb: Callback) {
    cb(null, this.live(key)?.members.size ?? 0)
  }

  expire(key: string, seconds: number, cb: Callback) {
    const set = this.live(key)
    if (set) {
      set.expiresAt = this.now + seconds * 1000
    }
    cb(null, set ? 1 : 0)
  }

  /** Same contract as the Redis TTL command: -2 missing, -1 no expiry, else seconds left */
  ttl(key: string): number {
    const set = this.live(key)
    if (!set) return -2
    if (set.expiresAt == null) return -1
    return Math.round((set.expiresAt - this.now) / 1000)
  }

  size(key: string): number {
    return this.live(key)?.members.size ?? 0
  }

  private live(key: string): SortedSet | undefined {
    const set = this.store.get(key)
    if (set && set.expiresAt != null && set.expiresAt <= this.now) {
      this.store.delete(key)
      return undefined
    }
    return set
  }
}

const at = (iso: string) => new Date(iso)

describe('isRateLimited', () => {
  it('allows downloads up to the limit and refuses the next one', async() => {
    const redis = new FakeRedis(at('2026-11-08T10:00:00Z'))

    for (let i = 0; i < 10; i++) {
      expect(await isRateLimited(redis, IP, 10)).toBe(false)
    }

    expect(await isRateLimited(redis, IP, 10)).toBe(true)
  })

  it('does not count a refused attempt', async() => {
    const redis = new FakeRedis(at('2026-11-08T10:00:00Z'))
    for (let i = 0; i < 2; i++) {
      await isRateLimited(redis, IP, 2)
    }
    redis.advanceTo(at('2026-11-08T16:00:00Z'))
    const ttlBefore = redis.ttl(KEY)

    expect(await isRateLimited(redis, IP, 2)).toBe(true)

    expect(redis.size(KEY)).toBe(2)
    expect(redis.ttl(KEY)).toBe(ttlBefore)
  })

  it('stops counting each download 24h after it happened', async() => {
    const redis = new FakeRedis(at('2026-11-08T10:00:00Z'))
    await isRateLimited(redis, IP, 2)
    redis.advanceTo(at('2026-11-08T16:00:00Z'))
    await isRateLimited(redis, IP, 2)

    redis.advanceTo(at('2026-11-09T09:59:59Z'))
    expect(await isRateLimited(redis, IP, 2)).toBe(true)

    // the 10:00 download has aged out, freeing one slot; the 16:00 one still counts
    redis.advanceTo(at('2026-11-09T10:00:01Z'))
    expect(await isRateLimited(redis, IP, 2)).toBe(false)
    expect(await isRateLimited(redis, IP, 2)).toBe(true)
  })

  it('expires the key 24h after the last download so idle IPs clean up', async() => {
    const redis = new FakeRedis(at('2026-11-08T10:00:00Z'))
    await isRateLimited(redis, IP, 10)
    redis.advanceTo(at('2026-11-08T16:00:00Z'))
    await isRateLimited(redis, IP, 10)

    expect(redis.ttl(KEY)).toBe(DAY)
  })

  it('replays the production sequence: refused within 24h of the 1st download, allowed after', async() => {
    // Observed on 2026-11-08/09 for a published dataset (limit 10)
    const downloads = [
      '2026-11-08T10:26:55.315Z', '2026-11-08T11:00:32.697Z', '2026-11-08T12:47:54.660Z',
      '2026-11-08T13:04:14.814Z', '2026-11-08T13:18:08.465Z', '2026-11-08T13:27:00.955Z',
      '2026-11-08T13:49:00.797Z', '2026-11-08T13:50:41.289Z', '2026-11-08T14:05:57.149Z',
      '2026-11-08T14:18:55.650Z',
    ]
    const redis = new FakeRedis(at(downloads[0]))
    for (const ts of downloads) {
      redis.advanceTo(at(ts))
      expect(await isRateLimited(redis, IP, 10)).toBe(false)
    }

    redis.advanceTo(at('2026-11-09T10:26:55.000Z'))
    expect(await isRateLimited(redis, IP, 10)).toBe(true)

    redis.advanceTo(at('2026-11-09T10:27:00.548Z'))
    expect(await isRateLimited(redis, IP, 10)).toBe(false)
    expect(redis.size(KEY)).toBe(10)
  })
})
