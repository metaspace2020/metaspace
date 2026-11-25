import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import {
  trackBeginCheckout,
  trackPlansPageView,
  trackProCta,
  trackProFaqOpen,
  trackProPeriodChange,
} from '../../lib/gtag'
import ProPlans from './sections/ProPlans'
import config from '../../lib/config'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

vi.mock('../../lib/gtag', () => ({
  trackPlansPageView: vi.fn(),
  trackBeginCheckout: vi.fn(),
  trackProCta: vi.fn(),
  trackProPeriodChange: vi.fn(),
  trackProFaqOpen: vi.fn(),
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
let activeSubscription: { planId: string } | null = null

const mockQueryResult = (data: Record<string, any>, loading = false) => ({
  result: ref(data),
  loading: ref(loading),
  onResult: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  allPlans = plans
  currentUser = { id: 'u1' }
  activeSubscription = null
  ;(useQuery as any).mockImplementation((query: any) => {
    if (query === getPlansQuery) {
      return mockQueryResult({ allPlans })
    }
    if (query === getActiveUserSubscriptionQuery) {
      return mockQueryResult({ activeUserSubscription: activeSubscription })
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

describe('ProPage campaigns', () => {
  const mountPage = () =>
    mount(ProPage, {
      global: {
        plugins: [store, router],
        stubs: { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true },
      },
    })

  const twoTermPlan = (id: string, name: string, tier: string, order: number, y1: number, y2: number) => ({
    id,
    tier,
    name,
    description: '',
    isActive: true,
    isDefault: false,
    displayOrder: order,
    pricingOptions: [
      { id: `${id}-y1`, periodMonths: 12, priceCents: y1, displayName: '1 year', isActive: true, displayOrder: 1 },
      { id: `${id}-y2`, periodMonths: 24, priceCents: y2, displayName: '2 years', isActive: true, displayOrder: 2 },
    ],
    planRules: [],
  })

  const packPlan = {
    id: 'pack',
    type: 'pack',
    tier: 'standard',
    name: 'Dataset pack',
    description: '',
    isActive: true,
    isDefault: false,
    displayOrder: 10,
    pricingOptions: [
      { id: 'pack-6m', periodMonths: 6, priceCents: 34900, displayName: '6 months', isActive: true, displayOrder: 0 },
    ],
    planRules: [],
  }

  const setToday = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }

  const pushOnClick = async (wrapper: ReturnType<typeof mountPage>, selector: string) => {
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    await wrapper.find(selector).trigger('click')
    const url = pushSpy.mock.calls[0]?.[0]
    pushSpy.mockRestore()
    return url
  }

  beforeEach(() => {
    allPlans = [
      plans[0],
      twoTermPlan('p1', 'Low', 'low', 1, 99900, 189900),
      twoTermPlan('p2', 'Medium', 'medium', 2, 299900, 539900),
      packPlan,
    ] as any
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows no campaign before Black Friday and checks out without a coupon', async () => {
    setToday('2026-11-26T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
    expect(wrapper.find('.pro-coupon').exists()).toBe(false)
    expect(wrapper.find('#claim').exists()).toBe(false)
    expect(wrapper.findComponent(ProPlans).props('blackFriday')).toBeNull()
    expect(await pushOnClick(wrapper, '[data-test="subscribe-advanced"]')).toBe('/payment?planId=p2')
  })

  it('shows the Black Friday banner and codes from the 27th', async () => {
    setToday('2026-11-28T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.findAll('.pro-campaign-banner')).toHaveLength(1)
    expect(wrapper.find('#claim').exists()).toBe(false)
    expect(wrapper.find('.pro-coupon').exists()).toBe(true)
    expect(wrapper.findComponent(ProPlans).props('blackFriday')).toMatchObject({ headlinePercent: 50 })
  })

  it('carries the plan code and its pricing option to checkout while Black Friday is live', async () => {
    setToday('2026-11-28T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(await pushOnClick(wrapper, '[data-test="subscribe-essential"]')).toBe(
      '/payment?planId=p1&pricingId=p1-y1&coupon=ESSENTIALPROMO1'
    )
    expect(await pushOnClick(wrapper, '[data-test="buy-dataset-pack"]')).toBe(
      '/payment?planId=pack&pricingId=pack-6m&coupon=PACKPROMO6'
    )
  })

  it('carries the two-year code and pricing option when the two-year term is selected', async () => {
    setToday('2026-11-28T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    wrapper.findComponent(ProPlans).vm.$emit('period', '2 years')
    await nextTick()
    expect(await pushOnClick(wrapper, '[data-test="subscribe-essential"]')).toBe(
      '/payment?planId=p1&pricingId=p1-y2&coupon=ESSENTIALPROMO2'
    )
  })

  it('checks out without a coupon on the plan the visitor already has', async () => {
    setToday('2026-11-28T12:00:00Z')
    activeSubscription = { planId: 'p1' }
    const wrapper = mountPage()
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    wrapper.findComponent(ProPlans).vm.$emit('subscribe', 'p1')
    expect(pushSpy).toHaveBeenCalledWith('/payment?planId=p1')
    pushSpy.mockRestore()
  })

  it('checks out without a coupon on a term that has no codes', async () => {
    setToday('2026-11-28T12:00:00Z')
    allPlans = [
      plans[0],
      {
        ...twoTermPlan('es', 'Essential', 'essential', 1, 99900, 189900),
        pricingOptions: [
          { id: 'es-m', periodMonths: 1, priceCents: 9900, displayName: 'Monthly', isActive: true, displayOrder: 0 },
          { id: 'es-y', periodMonths: 12, priceCents: 99900, displayName: 'Annual', isActive: true, displayOrder: 1 },
        ],
      },
    ] as any
    const wrapper = mountPage()
    await nextTick()
    wrapper.findComponent(ProPlans).vm.$emit('period', 'Monthly')
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    wrapper.findComponent(ProPlans).vm.$emit('subscribe', 'es')
    expect(pushSpy).toHaveBeenCalledWith('/payment?planId=es')
    pushSpy.mockRestore()
  })

  describe('banner offset', () => {
    const originalWidth = window.innerWidth
    const originalRect = Element.prototype.getBoundingClientRect
    const offsetOf = (wrapper: ReturnType<typeof mountPage>) =>
      (wrapper.find('.pro-page').element as HTMLElement).style.getPropertyValue('--pro-campaign-offset')

    beforeEach(() => {
      Element.prototype.getBoundingClientRect = function () {
        return { height: this.classList.contains('pro-campaign-banners') ? 108 : 0 } as DOMRect
      }
    })

    afterEach(() => {
      window.innerWidth = originalWidth
      Element.prototype.getBoundingClientRect = originalRect
    })

    it('is the measured banner height at 768px and wider', async () => {
      setToday('2026-12-01T12:00:00Z')
      window.innerWidth = 768
      const wrapper = mountPage()
      await nextTick()
      await nextTick()
      expect(offsetOf(wrapper)).toBe('108px')
    })

    it('is not set below 768px', async () => {
      setToday('2026-12-01T12:00:00Z')
      window.innerWidth = 767
      const wrapper = mountPage()
      await nextTick()
      await nextTick()
      expect(offsetOf(wrapper)).toBe('')
    })

    it('follows a resize across the breakpoint', async () => {
      setToday('2026-12-01T12:00:00Z')
      window.innerWidth = 1024
      const wrapper = mountPage()
      await nextTick()
      await nextTick()
      expect(offsetOf(wrapper)).toBe('108px')
      window.innerWidth = 500
      window.dispatchEvent(new Event('resize'))
      await nextTick()
      expect(offsetOf(wrapper)).toBe('')
      wrapper.unmount()
    })

    it('leaves the page untouched when no campaign is live', async () => {
      setToday('2026-11-26T12:00:00Z')
      const wrapper = mountPage()
      await nextTick()
      await nextTick()
      expect(offsetOf(wrapper)).toBe('')
      expect(wrapper.find('.pro-page').attributes('style')).toBeUndefined()
    })
  })

  it('renders both banners before the section nav and the claim section once Cyber Monday starts', async () => {
    setToday('2026-12-01T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.findAll('.pro-campaign-banner')).toHaveLength(2)
    const page = wrapper.find('.pro-page').element
    expect(page.firstElementChild?.querySelector('.pro-campaign-banner')).not.toBeNull()
    expect(page.children[1].classList.contains('pro-section-nav')).toBe(true)
    const html = wrapper.html()
    expect(wrapper.find('#claim').exists()).toBe(true)
    expect(html.indexOf('id="claim"')).toBeGreaterThan(html.indexOf('id="analysis"'))
    expect(html.indexOf('id="claim"')).toBeLessThan(html.indexOf('id="privacy"'))
  })

  it('keeps the page campaign-free once both campaigns have ended', async () => {
    setToday('2027-01-01T00:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
    expect(wrapper.find('#claim').exists()).toBe(false)
  })

  it('renders nothing campaign-related before the mounted hook has set the date', async () => {
    setToday('2026-12-01T12:00:00Z')
    const wrapper = mountPage()
    // The first render is what prerendering and hydration see: `now` is still null.
    expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
    expect(wrapper.find('#claim').exists()).toBe(false)
    expect(wrapper.find('.pro-coupon').exists()).toBe(false)
    await nextTick()
    expect(wrapper.find('#claim').exists()).toBe(true)
  })

  it('never says "Black Friday" on 15 Dec: the same codes are shown as the year-end offer', async () => {
    setToday('2026-12-15T12:00:00Z')
    const wrapper = mountPage()
    await nextTick()
    expect(wrapper.text()).not.toMatch(/black friday/i)
    expect(wrapper.find('.pro-campaign-banner__label').text()).toBe('YEAR-END OFFER · UNTIL 31\u00a0DEC\u00a02026')
    expect(wrapper.find('.pro-campaign-banner__text').text()).toBe(
      'Up to 50% off METASPACE Pro plans until 31\u00a0Dec\u00a02026. Each plan has its own code.'
    )
    expect(wrapper.find('[data-test="campaign-callout"]').text()).toContain('YEAR-END OFFER · UNTIL 31 DEC 2026')
    expect(wrapper.find('.pro-coupon__label').text()).toMatch(/^YEAR-END · \d+% OFF$/)
    expect(wrapper.find('.pro-campaign-footnote').text()).toContain('Year-end codes are valid until 31 Dec 2026.')
    expect(wrapper.findComponent(ProPlans).props('blackFriday').codes).toHaveLength(9)
    expect(wrapper.find('#claim').exists()).toBe(false)
  })

  describe('?feat=promo preview', () => {
    const features = config.features as Record<string, boolean>
    afterEach(() => {
      features.promo = false
      features.promo1 = false
      features.promo2 = false
    })

    it('shows only Black Friday with promo1', async () => {
      setToday('2026-11-01T12:00:00Z')
      features.promo1 = true
      const wrapper = mountPage()
      await nextTick()
      expect(wrapper.findAll('.pro-campaign-banner')).toHaveLength(1)
      expect(wrapper.find('.pro-campaign-banner__label').text()).toContain('BLACK FRIDAY')
      expect(wrapper.find('.pro-coupon').exists()).toBe(true)
      expect(wrapper.find('#claim').exists()).toBe(false)
    })

    it('shows only Cyber Monday with promo2', async () => {
      setToday('2026-11-01T12:00:00Z')
      features.promo2 = true
      const wrapper = mountPage()
      await nextTick()
      expect(wrapper.findAll('.pro-campaign-banner')).toHaveLength(1)
      expect(wrapper.find('.pro-campaign-banner__label').text()).toBe('CYBER MONDAY')
      expect(wrapper.find('#claim').exists()).toBe(true)
      expect(wrapper.find('.pro-coupon').exists()).toBe(false)
      expect(wrapper.findComponent(ProPlans).props('blackFriday')).toBeNull()
    })

    it('shows both campaigns before their windows when the promo flag is on', async () => {
      setToday('2026-11-01T12:00:00Z')
      config.features.promo = true
      const wrapper = mountPage()
      // Nothing campaign-related in the first render, exactly like the prerendered HTML.
      expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
      expect(wrapper.find('#claim').exists()).toBe(false)
      await nextTick()
      expect(wrapper.findAll('.pro-campaign-banner')).toHaveLength(2)
      expect(wrapper.find('#claim').exists()).toBe(true)
      expect(wrapper.find('.pro-coupon').exists()).toBe(true)
      expect(wrapper.findComponent(ProPlans).props('blackFriday')).toMatchObject({ headlinePercent: 50 })
    })

    it('shows nothing campaign-related before the windows when the flag is off', async () => {
      setToday('2026-11-01T12:00:00Z')
      config.features.promo = false
      const wrapper = mountPage()
      await nextTick()
      expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
      expect(wrapper.find('#claim').exists()).toBe(false)
      expect(wrapper.find('.pro-coupon').exists()).toBe(false)
      expect(wrapper.findComponent(ProPlans).props('blackFriday')).toBeNull()
    })
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
  const mountPage = () => {
    const wrapper = mount(ProPage, {
      global: {
        plugins: [store, router],
        stubs: { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true },
      },
    })
    // jsdom cannot follow real links; stop the default navigation of any
    // clicked anchor while letting the click bubble to the page's delegated
    // CTA handler (which is what these tests observe).
    wrapper.element.addEventListener('click', (e) => e.preventDefault())
    return wrapper
  }

  it('tracks the plans page view on mount as signed in when a user is present', async () => {
    mountPage()
    await nextTick()
    expect(trackPlansPageView).toHaveBeenCalledWith(true)
  })

  // Anonymous visitors are the top of the funnel; they must be tracked too.
  it('tracks the plans page view on mount as anonymous when there is no current user', async () => {
    currentUser = null
    mountPage()
    await nextTick()
    expect(trackPlansPageView).toHaveBeenCalledWith(false)
  })

  it('tracks begin_checkout with the plan, price in cents and login state before routing to payment', async () => {
    const wrapper = mountPage()
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(trackBeginCheckout).toHaveBeenCalledWith({
      planId: 'p2',
      planName: 'Medium',
      priceCents: 299900,
      billingPeriod: '1 year',
      loggedIn: true,
    })
    expect(pushSpy).toHaveBeenCalledWith('/payment?planId=p2')
    pushSpy.mockRestore()
  })

  it('tracks begin_checkout for anonymous visitors with logged_in false', async () => {
    currentUser = null
    const wrapper = mountPage()
    await nextTick()
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any)
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(trackBeginCheckout).toHaveBeenCalledWith(expect.objectContaining({ planId: 'p2', loggedIn: false }))
    pushSpy.mockRestore()
  })

  // CTAs are tracked by one delegated click handler on the page root, keyed on
  // data-cta, so a new button only needs the attribute to be measured.
  it('tracks a hero CTA click with its id, section, destination and login state', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-cta="hero-submit"]').trigger('click')
    expect(trackProCta).toHaveBeenCalledWith({
      ctaId: 'hero-submit',
      section: 'hero',
      destination: '#plans',
      loggedIn: true,
    })
  })

  it('derives the section of a CTA from the enclosing section id', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-cta="docs-card-0"]').trigger('click')
    expect(trackProCta).toHaveBeenCalledWith(
      expect.objectContaining({ ctaId: 'docs-card-0', section: 'docs', destination: expect.stringContaining('/docs/') })
    )
  })

  it('tracks a CTA click as anonymous when there is no current user', async () => {
    currentUser = null
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('[data-cta="hero-submit"]').trigger('click')
    expect(trackProCta).toHaveBeenCalledWith(expect.objectContaining({ ctaId: 'hero-submit', loggedIn: false }))
  })

  it('does not track clicks on elements without a data-cta attribute', async () => {
    const wrapper = mountPage()
    await nextTick()
    await wrapper.find('.pro-hero__copy').trigger('click')
    expect(trackProCta).not.toHaveBeenCalled()
  })

  it('tracks a billing period change', async () => {
    const wrapper = mountPage()
    await nextTick()
    wrapper.findComponent(ProPlans).vm.$emit('period', '1 year')
    await nextTick()
    expect(trackProPeriodChange).toHaveBeenCalledWith({ billingPeriod: '1 year', loggedIn: true })
  })

  it('tracks an FAQ entry being expanded, but not collapsed', async () => {
    const wrapper = mountPage()
    await nextTick()
    // The first entry starts open, so expand the second one.
    const trigger = wrapper.findAll('.pro-faq__trigger')[1]
    const question = trigger.find('span').text()
    await trigger.trigger('click')
    expect(trackProFaqOpen).toHaveBeenCalledWith({ question, loggedIn: true })
    await trigger.trigger('click')
    expect(trackProFaqOpen).toHaveBeenCalledTimes(1)
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
