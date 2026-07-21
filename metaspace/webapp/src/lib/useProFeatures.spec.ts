import { ref } from 'vue'
import { vi } from 'vitest'
import { useQuery } from '@vue/apollo-composable'
import { useProFeatures } from './useProFeatures'
import { proFeatureWhitelistQuery } from '../api/plan'
import { getActiveUserSubscriptionQuery } from '../api/subscription'
import { currentUserRoleQuery } from '../api/user'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

describe('useProFeatures', () => {
  interface MockOptions {
    whitelist?: string[]
    isActive?: boolean | null
    role?: string | null
    // A plain boolean applies to every query; an object sets each query independently
    // (omitted queries default to settled) so mixed in-flight states can be expressed.
    loading?: boolean | { whitelist?: boolean; subscription?: boolean; user?: boolean }
  }

  // Routes each useQuery call to a canned result based on which document was passed.
  const mockQueries = ({ whitelist = [], isActive = null, role = null, loading = false }: MockOptions) => {
    const isLoading = (key: 'whitelist' | 'subscription' | 'user') =>
      typeof loading === 'boolean' ? loading : loading[key] ?? false
    ;(useQuery as any).mockImplementation((query: any) => {
      if (query === proFeatureWhitelistQuery) {
        return {
          result: ref({ proFeatureWhitelist: whitelist }),
          loading: ref(isLoading('whitelist')),
          onResult: vi.fn(),
        }
      }
      if (query === getActiveUserSubscriptionQuery) {
        return {
          result: ref({ activeUserSubscription: isActive === null ? null : { isActive } }),
          loading: ref(isLoading('subscription')),
          onResult: vi.fn(),
        }
      }
      if (query === currentUserRoleQuery) {
        return {
          result: ref({ currentUser: role === null ? null : { id: 'u1', name: 'Test', role } }),
          loading: ref(isLoading('user')),
          onResult: vi.fn(),
        }
      }
      throw new Error('Unexpected query passed to useQuery')
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should deny every feature to an anonymous user', () => {
    mockQueries({})
    const { canUse } = useProFeatures()

    expect(canUse('segmentation')).toBe(false)
    expect(canUse('diffAnalysis')).toBe(false)
  })

  it('should allow every feature for a pro subscriber who is not whitelisted', () => {
    mockQueries({ isActive: true, role: 'user' })
    const { canUse, isPro } = useProFeatures()

    expect(isPro.value).toBe(true)
    expect(canUse('segmentation')).toBe(true)
    expect(canUse('diffAnalysis')).toBe(true)
  })

  it('should deny a subscriber whose subscription is inactive', () => {
    mockQueries({ isActive: false, role: 'user' })
    const { canUse, isPro } = useProFeatures()

    expect(isPro.value).toBe(false)
    expect(canUse('segmentation')).toBe(false)
  })

  it('should allow only the whitelisted feature for a non-pro user', () => {
    mockQueries({ whitelist: ['segmentation'], role: 'user' })
    const { canUse } = useProFeatures()

    expect(canUse('segmentation')).toBe(true)
    expect(canUse('diffAnalysis')).toBe(false)
  })

  it('should allow every feature for an admin who is neither pro nor whitelisted', () => {
    mockQueries({ role: 'admin' })
    const { canUse, isAdmin } = useProFeatures()

    expect(isAdmin.value).toBe(true)
    expect(canUse('segmentation')).toBe(true)
    expect(canUse('diffAnalysis')).toBe(true)
  })

  it('should not treat a role merely containing "admin" as admin', () => {
    mockQueries({ role: 'non-admin' })
    const { isAdmin, canUse } = useProFeatures()

    expect(isAdmin.value).toBe(false)
    expect(canUse('segmentation')).toBe(false)
  })

  it('should report loading while any underlying query is in flight', () => {
    mockQueries({ loading: true })
    const { loading } = useProFeatures()

    expect(loading.value).toBe(true)
  })

  // The bug `loading` exists to fix: the cache-first queries settle immediately while the
  // cache-and-network subscription query is still in flight, briefly hiding a paying user's Pro access.
  it('should report loading while only the subscription query is in flight', () => {
    mockQueries({ role: 'user', loading: { subscription: true } })
    const { loading } = useProFeatures()

    expect(loading.value).toBe(true)
  })

  it('should not report loading once every query has settled', () => {
    mockQueries({ role: 'user' })
    const { loading } = useProFeatures()

    expect(loading.value).toBe(false)
  })
})
