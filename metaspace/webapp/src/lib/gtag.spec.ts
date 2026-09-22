import { describe, it, expect, vi, beforeEach } from 'vitest'
import { event, pageview, set, purchase } from 'vue-gtag'
import * as gtag from './gtag'
import {
  buildGtagOptions,
  pageTrackerTemplate,
  setSubscriptionUserProperties,
  setUserProperties,
  trackBeginCheckout,
  trackPaymentPageView,
  trackPlansPageView,
  trackProCta,
  trackProFaqOpen,
  trackProPeriodChange,
  trackPurchaseComplete,
  trackSuccessPageView,
} from './gtag'

vi.mock('vue-gtag', () => ({
  event: vi.fn(),
  pageview: vi.fn(),
  set: vi.fn(),
  purchase: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('user identity', () => {
  // Deliberate: GA must not be able to tie behaviour to an account. These
  // guard against the identification wiring coming back in any form.
  it('exports nothing that could attach an account id to analytics', () => {
    expect(Object.keys(gtag)).not.toContain('setUserId')
    expect(Object.keys(gtag)).not.toContain('clearUserId')
    expect(Object.keys(gtag)).not.toContain('resolveInitialUserId')
  })

  it('never sends user_id or an id-bearing user property', () => {
    trackPaymentPageView(true, 'p2')
    trackSuccessPageView(true, true)
    setSubscriptionUserProperties({ planId: 'p2', billingInterval: 'year' })
    for (const call of vi.mocked(set).mock.calls) {
      const payload = call[0] as Record<string, any>
      expect(payload).not.toHaveProperty('user_id')
      expect(JSON.stringify(payload)).not.toMatch(/user_id|metaspace_user_id/)
    }
  })

  it('sets user properties as a GA user_properties bundle', () => {
    setUserProperties({ plan_tier: 'advanced' })
    expect(set).toHaveBeenCalledWith({ user_properties: { plan_tier: 'advanced' } })
  })
})

describe('page views', () => {
  // vue-gtag already sends a page_view on every router navigation. The helper
  // must not send a second one or /pro, /payment and /success double-count.
  it('records the plans page view as a custom event without a duplicate page_view', () => {
    trackPlansPageView(false)
    expect(pageview).not.toHaveBeenCalled()
    expect(event).toHaveBeenCalledWith('view_plans_page', { section: 'plans', logged_in: false })
  })

  it('records the payment page view without a duplicate page_view', () => {
    trackPaymentPageView(true, 'p2')
    expect(pageview).not.toHaveBeenCalled()
    expect(event).toHaveBeenCalledWith('view_payment_page', { section: 'plans', plan_id: 'p2', logged_in: true })
  })

  it('records the success page view without a duplicate page_view', () => {
    trackSuccessPageView(true, true)
    expect(pageview).not.toHaveBeenCalled()
    expect(event).toHaveBeenCalledWith('view_success_page', { section: 'plans', from_payment: true, logged_in: true })
  })
})

describe('checkout funnel', () => {
  it('sends begin_checkout with the price converted from cents to currency units', () => {
    trackBeginCheckout({
      planId: 'p2',
      planName: 'Advanced',
      priceCents: 299900,
      billingPeriod: 'Annual',
      loggedIn: true,
    })
    expect(event).toHaveBeenCalledWith('begin_checkout', {
      currency: 'USD',
      value: 2999,
      section: 'plans',
      plan_id: 'p2',
      plan_name: 'Advanced',
      billing_period: 'Annual',
      logged_in: true,
      items: [{ item_id: 'p2', item_name: 'Advanced', price: 2999, quantity: 1 }],
    })
  })

  it('sends purchase with the value converted from cents to currency units', () => {
    trackPurchaseComplete({ transactionId: 't1', valueCents: 4999, planId: 'p1', planName: 'Essential' })
    expect(purchase).toHaveBeenCalledWith({
      transaction_id: 't1',
      value: 49.99,
      currency: 'USD',
      items: [{ item_id: 'p1', item_name: 'Essential', item_category: 'subscription', quantity: 1, price: 49.99 }],
    })
    expect(event).toHaveBeenCalledWith('purchase_complete', {
      section: 'plans',
      transaction_id: 't1',
      subscription_id: 'unknown',
      plan_id: 'p1',
      plan_name: 'Essential',
      value: 49.99,
    })
  })
})

describe('pro page interactions', () => {
  it('sends pro_cta_click with the cta id, section, destination and login state', () => {
    trackProCta({ ctaId: 'hero-submit', section: 'hero', destination: '#plans', loggedIn: false })
    expect(event).toHaveBeenCalledWith('pro_cta_click', {
      cta_id: 'hero-submit',
      section: 'hero',
      destination: '#plans',
      logged_in: false,
    })
  })

  it('sends pro_period_change with the chosen billing period', () => {
    trackProPeriodChange({ billingPeriod: 'Monthly', loggedIn: true })
    expect(event).toHaveBeenCalledWith('pro_period_change', { billing_period: 'Monthly', logged_in: true })
  })

  it('sends pro_faq_open with the question that was expanded', () => {
    trackProFaqOpen({ question: 'Is my data private?', loggedIn: false })
    expect(event).toHaveBeenCalledWith('pro_faq_open', { question: 'Is my data private?', logged_in: false })
  })
})

describe('resilience', () => {
  it('swallows errors thrown by the gtag library', () => {
    ;(event as any).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    expect(() => trackProCta({ ctaId: 'x', section: 's', destination: '/', loggedIn: false })).not.toThrow()
  })
})

describe('subscription user properties', () => {
  it('reports the active plan id as a user property', () => {
    setSubscriptionUserProperties({ planId: 'p2', billingInterval: 'year' })
    expect(set).toHaveBeenCalledWith({ user_properties: { plan_id: 'p2', billing_interval: 'year' } })
  })

  it('reports free-tier users without an active subscription', () => {
    setSubscriptionUserProperties(null)
    expect(set).toHaveBeenCalledWith({ user_properties: { plan_id: 'free', billing_interval: null } })
  })
})

describe('buildGtagOptions', () => {
  it('configures only the measurement id - no user_id, signed in or not', () => {
    const options = buildGtagOptions({ measurementId: 'G-ABC', production: true })
    expect(options.config).toEqual({ id: 'G-ABC' })
    expect(options.enabled).toBe(true)
    expect(options.pageTrackerTemplate).toBe(pageTrackerTemplate)
  })

  it('stays disabled outside production builds', () => {
    expect(buildGtagOptions({ measurementId: 'G-ABC', production: false }).enabled).toBe(false)
  })

  it('stays disabled when no measurement id is configured', () => {
    expect(buildGtagOptions({ measurementId: '', production: true }).enabled).toBe(false)
  })
})

describe('pageTrackerTemplate', () => {
  it('sends the SEO title of the route instead of its internal name', () => {
    const view = pageTrackerTemplate({ name: 'pro', path: '/pro', fullPath: '/pro#plans' } as any)
    expect(view.page_title).toBe('METASPACE Pro - Private datasets and downstream analysis')
    expect(view.page_path).toBe('/pro')
    expect(view.page_location).toBe(window.location.href)
  })
})
