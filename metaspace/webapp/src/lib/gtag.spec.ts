import { describe, it, expect, vi, beforeEach } from 'vitest'
import { event, pageview, set, purchase } from 'vue-gtag'
import {
  clearUserId,
  setUserId,
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
  it('sets the GA user_id from the given id', () => {
    setUserId('abc-123')
    expect(set).toHaveBeenCalledWith({ user_id: 'abc-123' })
  })

  it('clears the GA user_id on sign-out', () => {
    clearUserId()
    expect(set).toHaveBeenCalledWith({ user_id: null })
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
    trackPaymentPageView('u1', 'p2')
    expect(pageview).not.toHaveBeenCalled()
    expect(event).toHaveBeenCalledWith('view_payment_page', { section: 'plans', plan_id: 'p2', logged_in: true })
  })

  it('records the success page view without a duplicate page_view', () => {
    trackSuccessPageView('u1', true)
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
