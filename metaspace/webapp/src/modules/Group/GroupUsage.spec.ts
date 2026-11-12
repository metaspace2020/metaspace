import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { useQuery } from '@vue/apollo-composable'
import GroupUsage from './GroupUsage'
import { getActiveGroupSubscriptionQuery } from '../../api/subscription'
import { getApiUsagesQuery } from '../../api/plan'
import { currentUserRoleQuery } from '../../api/user'
import { ElCard, ElTable, ElTableColumn, ElTag } from '../../lib/element-plus'
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

// A private submission performed by a group member on their own plan.
const OWN_USAGE = {
  id: 1,
  userId: 'u1',
  datasetId: 'ds-own',
  projectId: null,
  groupId: 'gr1',
  actionType: 'create',
  type: 'dataset',
  source: 'web',
  canEdit: false,
  actionDt: '2026-11-10T15:32:26.627Z',
  sponsorUserId: null,
  sponsorGroupId: null,
  project: null,
  user: { id: 'u1', name: 'Admin Doe', email: 'jdoe@test.com' },
}

// The same action performed by a non-Pro project member, billed to this group through a sponsorship.
const SPONSORED_USAGE = {
  ...OWN_USAGE,
  id: 2,
  userId: 'u2',
  datasetId: 'ds-sponsored',
  groupId: null,
  projectId: 'pr1',
  sponsorUserId: 'u1',
  sponsorGroupId: 'gr1',
  project: { id: 'pr1', name: 'Replicate' },
  user: { id: 'u2', name: 'User Doe', email: 'user@test.com' },
}

describe('GroupUsage', () => {
  const mockQueries = (subscription: any, apiUsages: any[] | null = null) => {
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
      if (query === getApiUsagesQuery) {
        return {
          result: ref(apiUsages == null ? null : { allApiUsages: apiUsages, apiUsagesCount: apiUsages.length }),
          loading: ref(false),
        }
      }
      // Remaining queries (quota, top-up options) are irrelevant here.
      return { result: ref(null), loading: ref(false), refetch: vi.fn(), onResult: vi.fn() }
    })
  }

  const renderUsage = async (subscription: any, apiUsages: any[] | null = null) => {
    mockQueries(subscription, apiUsages)
    const wrapper = mount(GroupUsage, {
      global: {
        plugins: [store, router],
        // The app resolves el-* tags via unplugin-vue-components, which the
        // vitest config does not run; el-card must be registered or its slot
        // content silently drops. The table components are needed for the
        // usage history rows to render.
        components: { 'el-card': ElCard, 'el-table': ElTable, 'el-table-column': ElTableColumn, 'el-tag': ElTag },
        // RouterLink is stubbed globally; the real one is needed to assert the project link's href.
        stubs: { GroupQuota: true, GroupTopup: true, RouterLink: false },
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

  it('marks sponsored usage with the performing user and the sponsoring project', async () => {
    const wrapper = await renderUsage(REGULAR_SUBSCRIPTION, [OWN_USAGE, SPONSORED_USAGE])

    const rows = wrapper.findAll('.el-table__body tr')
    expect(rows).toHaveLength(2)

    expect(rows[0].text()).toContain('Admin Doe')
    expect(rows[0].text()).not.toContain('Sponsored')

    expect(rows[1].text()).toContain('User Doe')
    expect(rows[1].text()).toContain('Sponsored')
    expect(rows[1].text()).toContain('Replicate')
    expect(rows[1].find('a[href="/project/pr1"]').exists()).toBe(true)
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
