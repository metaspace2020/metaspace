import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { useQuery } from '@vue/apollo-composable'
import GroupUsage from './GroupUsage'
import { getActiveGroupSubscriptionQuery } from '../../api/subscription'
import { currentUserRoleQuery } from '../../api/user'
import { ElCard } from '../../lib/element-plus'
import store from '../../store'
import router from '../../router'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: Symbol('apollo'),
}))

// Mirrors activeGroupSubscription for a regular (renewing) plan.
const REGULAR_SUBSCRIPTION = {
  id: 'sub1',
  userId: 'u1',
  planId: 'p1',
  billingInterval: 'yearly',
  startedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  cancelledAt: null,
  isActive: true,
  autoRenew: true,
  transactions: [],
  plan: { id: 'p1', name: 'Medium', tier: 'standard', description: 'Renewing plan', planRules: [] },
  paymentMethod: null,
}

// A pack: one-off, billingInterval null, plan carries type 'pack'.
const PACK_SUBSCRIPTION = {
  ...REGULAR_SUBSCRIPTION,
  id: 'sub2',
  billingInterval: null,
  autoRenew: false,
  plan: { ...REGULAR_SUBSCRIPTION.plan, id: 'p2', name: 'Dataset pack', type: 'pack', description: 'One-off pack' },
}

describe('GroupUsage', () => {
  const mockQueries = (subscription: any) => {
    ;(useQuery as any).mockImplementation((query: any) => {
      if (query === getActiveGroupSubscriptionQuery) {
        return {
          result: ref({ activeGroupSubscription: subscription }),
          loading: ref(false),
          refetch: vi.fn(),
        }
      }
      if (query === currentUserRoleQuery) {
        return { result: ref({ currentUser: { id: 'u1', role: 'admin' } }), loading: ref(false) }
      }
      // Remaining queries (api usages, quota, top-up options) are irrelevant here.
      return { result: ref(null), loading: ref(false), refetch: vi.fn(), onResult: vi.fn() }
    })
  }

  const renderUsage = async (subscription: any) => {
    mockQueries(subscription)
    const wrapper = mount(GroupUsage, {
      global: {
        plugins: [store, router],
        // The app resolves el-* tags via unplugin-vue-components, which the
        // vitest config does not run; el-card must be registered or its slot
        // content silently drops.
        components: { 'el-card': ElCard },
        stubs: { GroupQuota: true, GroupTopup: true },
      },
      props: { groupId: 'gr1' },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the auto-renew toggle for a regular subscription', async () => {
    const wrapper = await renderUsage(REGULAR_SUBSCRIPTION)

    expect(wrapper.text()).toContain('Auto-renew')
  })

  it('hides the auto-renew toggle for a pack subscription, which never renews', async () => {
    const wrapper = await renderUsage(PACK_SUBSCRIPTION)

    expect(wrapper.text()).not.toContain('Auto-renew')
  })
})
