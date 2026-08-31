import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useQuery } from '@vue/apollo-composable'
import ProPage from './ProPage'
import store from '../../store'
import router, { scrollBehavior } from '../../router'
import { getPlansQuery } from '../../api/plan'
import { getActiveUserSubscriptionQuery } from '../../api/subscription'
import { countUsersQuery, currentUserIdQuery } from '../../api/user'
import { countDatasetsQuery } from '../../api/dataset'
import { countPublicationsQuery } from '../../api/group'
import { trackBeginCheckout, trackPlansPageView } from '../../lib/gtag'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

vi.mock('../../lib/gtag', () => ({
  trackPlansPageView: vi.fn(),
  trackBeginCheckout: vi.fn(),
}))

const plans = [
  {
    id: 'free',
    tier: 'free',
    name: 'Free',
    description: '',
    isActive: true,
    isDefault: true,
    displayOrder: 0,
    pricingOptions: [],
    planRules: [],
  },
  {
    id: 'p2',
    tier: 'medium',
    name: 'Medium',
    description: '',
    isActive: true,
    isDefault: false,
    displayOrder: 2,
    pricingOptions: [
      { id: 'y1', periodMonths: 12, priceCents: 299900, displayName: '1 year', isActive: true, displayOrder: 1 },
    ],
    planRules: [],
  },
]

// Every useQuery() call in ProPage is routed through this single mock, keyed
// on the actual gql document rather than a shared blob of fields - a test
// built on one merged result object can't tell userCount from datasetCount,
// or notice a query fired without its variables. Matching per-query mirrors
// how DatasetActionsDropdown.spec.ts stubs multiple co-mounted queries.
let allPlans = plans
let currentUser: { id: string } | null = { id: 'u1' }

const mockQueryResult = (data: Record<string, any>, loading = false) => ({
  result: ref(data),
  loading: ref(loading),
  onResult: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  allPlans = plans
  currentUser = { id: 'u1' }
  ;(useQuery as any).mockImplementation((query: any) => {
    if (query === getPlansQuery) {
      return mockQueryResult({ allPlans })
    }
    if (query === getActiveUserSubscriptionQuery) {
      return mockQueryResult({ activeUserSubscription: null })
    }
    if (query === currentUserIdQuery) {
      return mockQueryResult({ currentUser })
    }
    if (query === countUsersQuery) {
      return mockQueryResult({ countUsers: 6077 })
    }
    if (query === countDatasetsQuery) {
      return mockQueryResult({ countDatasets: 76204 })
    }
    if (query === countPublicationsQuery) {
      return mockQueryResult({ countPublications: 651 })
    }
    return mockQueryResult({})
  })
})

describe('ProPage', () => {
  const mountPage = () =>
    mount(ProPage, {
      global: {
        plugins: [store, router],
        stubs: { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true },
      },
    })

  it('renders every section of the landing page', async () => {
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('.pro-hero').exists()).toBe(true)
    expect(wrapper.find('#analysis').exists()).toBe(true)
    expect(wrapper.find('#privacy').exists()).toBe(true)
    expect(wrapper.find('#plans').exists()).toBe(true)
    expect(wrapper.find('#procurement').exists()).toBe(true)
    expect(wrapper.find('.pro-cta').exists()).toBe(true)
  })

  it('switches the header to the Pro theme on mount', async () => {
    mountPage()
    await nextTick()
    expect(store.getters.themeVariant).toBe('pro')
  })

  it('wires each count query to its own field on the hero, not a shared blob', async () => {
    const wrapper = mountPage()
    await nextTick()

    // Each count must come from its own named query - not a merged object a
    // swapped userCount/datasetCount could still satisfy.
    expect(useQuery).toHaveBeenCalledWith(countUsersQuery)
    expect(useQuery).toHaveBeenCalledWith(countPublicationsQuery)
    const datasetsCall = (useQuery as any).mock.calls.find((call: any[]) => call[0] === countDatasetsQuery)
    expect(datasetsCall).toBeTruthy()
    // countDatasetsQuery's variables are a function (evaluated reactively by
    // apollo-composable), so assert on what calling it yields.
    expect(typeof datasetsCall[1]).toBe('function')
    expect(datasetsCall[1]()).toEqual({ dFilter: { metadataType: 'Imaging MS' } })

    expect(wrapper.text()).toContain('6,077')
    expect(wrapper.text()).toContain('76,204')
    expect(wrapper.text()).toContain('651')
  })

  it('routes to the payment page with the chosen plan id when subscribing', async () => {
    const wrapper = mountPage()
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/payment?planId=p2')
    pushSpy.mockRestore()
  })
})

describe('ProPage default billing period', () => {
  const mountPage = () =>
    mount(ProPage, {
      global: {
        plugins: [store, router],
        stubs: { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true },
      },
    })

  // Regression test for a real bug: the live backend names its periods
  // "Monthly" and "Annual", not "yearly", so matching on displayName left
  // the page defaulting to a bare monthly price. These displayNames
  // deliberately contain neither "year" nor "yearly" so the assertion can't
  // pass via the old string-matching logic.
  it('defaults to the shortest period of at least 12 months when one is available', async () => {
    allPlans = [
      plans[0],
      {
        ...plans[1],
        pricingOptions: [
          { id: 'm1', periodMonths: 1, priceCents: 3999, displayName: 'Monthly', isActive: true, displayOrder: 0 },
          {
            id: 'a1',
            periodMonths: 12,
            priceCents: 299900,
            displayName: 'Annual',
            isActive: true,
            displayOrder: 1,
          },
        ],
      },
    ]
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.text()).toContain('billed annually')
    expect(wrapper.text()).not.toContain('billed monthly')
  })

  it('falls back to the first available period when none reach 12 months', async () => {
    allPlans = [
      plans[0],
      {
        ...plans[1],
        pricingOptions: [
          { id: 'm1', periodMonths: 1, priceCents: 3999, displayName: 'Monthly', isActive: true, displayOrder: 0 },
          {
            id: 'q1',
            periodMonths: 3,
            priceCents: 10999,
            displayName: 'Quarterly',
            isActive: true,
            displayOrder: 1,
          },
        ],
      },
    ]
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.text()).toContain('billed monthly')
  })
})

describe('ProPage analytics', () => {
  const mountPage = () =>
    mount(ProPage, {
      global: {
        plugins: [store, router],
        stubs: { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true },
      },
    })

  it('tracks the plans page view on mount when a user is signed in', async () => {
    mountPage()
    await nextTick()
    expect(trackPlansPageView).toHaveBeenCalledWith('u1')
  })

  it('does not track the plans page view when there is no current user', async () => {
    currentUser = null
    mountPage()
    await nextTick()
    expect(trackPlansPageView).not.toHaveBeenCalled()
  })

  it('tracks begin_checkout with the plan and billing details before routing to payment', async () => {
    const wrapper = mountPage()
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(trackBeginCheckout).toHaveBeenCalledWith({
      planId: 'p2',
      planName: 'Medium',
      price: 299900,
      billingPeriod: '1 year',
    })
    expect(pushSpy).toHaveBeenCalledWith('/payment?planId=p2')
    pushSpy.mockRestore()
  })
})

describe('scrollBehavior', () => {
  const withHashTarget = (id: string, run: () => void) => {
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)
    try {
      run()
    } finally {
      document.body.removeChild(el)
    }
  }

  const withReducedMotion = (matches: boolean, run: () => void) => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches }) as MediaQueryList)
    try {
      run()
    } finally {
      window.matchMedia = original
    }
  }

  it('scrolls to the target element when the destination has a hash and the element exists', () => {
    withHashTarget('plans', () => {
      withReducedMotion(false, () => {
        const result = scrollBehavior!(
          { path: '/pro', hash: '#plans' } as any,
          { path: '/about', hash: '' } as any,
          false
        )
        expect(result).toEqual({ el: '#plans', top: 80, behavior: 'smooth' })
      })
    })
  })

  it('falls back to the top when the hash has no matching element on the page', () => {
    // No element with id "missing" exists.
    const result = scrollBehavior!(
      { path: '/pro', hash: '#missing' } as any,
      { path: '/about', hash: '' } as any,
      false
    )
    expect(result).toEqual({ top: 0 })
  })

  it('scrolls to the top when the destination has no hash', () => {
    const result = scrollBehavior!({ path: '/pro', hash: '' } as any, { path: '/about', hash: '' } as any, false)
    expect(result).toEqual({ top: 0 })
  })

  it('uses an immediate jump instead of a smooth scroll when reduced motion is requested', () => {
    withHashTarget('plans', () => {
      withReducedMotion(true, () => {
        const result = scrollBehavior!(
          { path: '/pro', hash: '#plans' } as any,
          { path: '/about', hash: '' } as any,
          false
        )
        expect(result).toEqual({ el: '#plans', top: 80, behavior: 'auto' })
      })
    })
  })

  it('honours the saved scroll position when navigating with browser back/forward', () => {
    const savedPosition = { left: 0, top: 240 }
    const result = scrollBehavior!(
      { path: '/pro', hash: '#plans' } as any,
      { path: '/about', hash: '' } as any,
      savedPosition
    )
    expect(result).toEqual(savedPosition)
  })

  // Regression: a filter commit landing after the /plans redirect rewrites the
  // query string via router.replace on the SAME path. That navigation used to
  // return { top: 0 } (hash stripped) and yank the user from #plans back to
  // the first section.
  it('keeps the scroll position on same-path navigations without a hash change', () => {
    const result = scrollBehavior!(
      { path: '/pro', hash: '' } as any,
      { path: '/pro', hash: '#plans' } as any, // hash dropped by a query-only replace
      false
    )
    expect(result).toBe(false)
  })

  it('does not re-scroll to the hash when a same-path replace keeps the same hash', () => {
    withHashTarget('plans', () => {
      const result = scrollBehavior!(
        { path: '/pro', hash: '#plans' } as any,
        { path: '/pro', hash: '#plans' } as any,
        false
      )
      expect(result).toBe(false)
    })
  })

  it('still scrolls when the hash changes within the same page', () => {
    withHashTarget('faq', () => {
      withReducedMotion(false, () => {
        const result = scrollBehavior!(
          { path: '/pro', hash: '#faq' } as any,
          { path: '/pro', hash: '#plans' } as any,
          false
        )
        expect(result).toEqual({ el: '#faq', top: 80, behavior: 'smooth' })
      })
    })
  })
})

describe('routing', () => {
  it('redirects /plans to the plans section of /pro', async () => {
    // router.resolve() does not follow `redirect` (vue-router only resolves
    // redirects during an actual navigation), so we assert on the outcome of
    // a real push instead of the raw resolve() result.
    await router.push('/plans')
    expect(router.currentRoute.value.path).toBe('/pro')
    expect(router.currentRoute.value.hash).toBe('#plans')
  })

  it('registers /pro', () => {
    expect(router.resolve('/pro').matched.length).toBeGreaterThan(0)
  })
})
