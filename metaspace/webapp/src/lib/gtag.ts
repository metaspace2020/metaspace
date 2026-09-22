import { event as gtagEvent, set as gtagSet, purchase as gtagPurchase } from 'vue-gtag'
import type { RouteLocationNormalized } from 'vue-router'
import { getSeoMetaForRoute } from './useSeo'

type GtagParams = Record<string, string | number | boolean | null | undefined | Array<Record<string, unknown>>>

const safely = (fn: () => void) => {
  try {
    fn()
  } catch (error) {
    // Analytics must never break the UI (ad-blockers, missing gtag, etc.)
  }
}

const centsToUnits = (cents: number | null | undefined) => Math.round(cents || 0) / 100

/** Set GA4 user properties (must be registered as custom dimensions in GA4 admin). */
export const setUserProperties = (properties: Record<string, string | number | boolean | null>) =>
  safely(() => gtagSet({ user_properties: properties }))

/** Describe the visitor's subscription so funnel reports can be split by plan. */
export const setSubscriptionUserProperties = (
  subscription: { planId?: string | null; billingInterval?: string | null } | null | undefined
) =>
  setUserProperties({
    plan_id: subscription?.planId || 'free',
    billing_interval: subscription?.billingInterval || null,
  })

/**
 * Page view payload for vue-gtag's router tracker: the same title the page
 * puts in <title> (see useSeo.ts) instead of the route's internal name.
 */
export const pageTrackerTemplate = (to: RouteLocationNormalized) => ({
  page_title: getSeoMetaForRoute(to).title,
  page_path: to.path,
  page_location: window.location.href,
})

/** vue-gtag plugin options for this environment. */
export const buildGtagOptions = (env: { measurementId: string; production: boolean }) => ({
  config: { id: env.measurementId },
  // disabled in dev because it impairs "break on uncaught exception", and
  // whenever no measurement id is configured for the environment
  enabled: env.production && env.measurementId !== '',
  pageTrackerTemplate,
})

export const trackEvent = (eventName: string, params?: GtagParams) => safely(() => gtagEvent(eventName, params))

export const trackPlansPageView = (loggedIn: boolean) =>
  trackEvent('view_plans_page', { section: 'plans', logged_in: loggedIn })

export const trackPaymentPageView = (loggedIn: boolean, planId?: string) =>
  trackEvent('view_payment_page', { section: 'plans', plan_id: planId || 'unknown', logged_in: loggedIn })

export const trackSuccessPageView = (loggedIn: boolean, fromPayment: boolean) =>
  trackEvent('view_success_page', { section: 'plans', from_payment: fromPayment, logged_in: loggedIn })

export const trackBeginCheckout = (planData: {
  planId: string
  planName: string
  priceCents: number
  billingPeriod: string
  loggedIn: boolean
}) => {
  const value = centsToUnits(planData.priceCents)
  trackEvent('begin_checkout', {
    currency: 'USD',
    value,
    section: 'plans',
    plan_id: planData.planId,
    plan_name: planData.planName,
    billing_period: planData.billingPeriod,
    logged_in: planData.loggedIn,
    items: [{ item_id: planData.planId, item_name: planData.planName, price: value, quantity: 1 }],
  })
}

export const trackPurchaseComplete = (purchaseData: {
  transactionId: string
  valueCents: number
  planId: string
  planName: string
  subscriptionId?: string
}) => {
  const value = centsToUnits(purchaseData.valueCents)
  safely(() =>
    gtagPurchase({
      transaction_id: purchaseData.transactionId,
      value,
      currency: 'USD',
      items: [
        {
          item_id: purchaseData.planId,
          item_name: purchaseData.planName,
          item_category: 'subscription',
          quantity: 1,
          price: value,
        },
      ],
    } as any)
  )
  // Companion custom event, kept for existing GA4 reports that key on it.
  trackEvent('purchase_complete', {
    section: 'plans',
    transaction_id: purchaseData.transactionId,
    subscription_id: purchaseData.subscriptionId || 'unknown',
    plan_id: purchaseData.planId,
    plan_name: purchaseData.planName,
    value,
  })
}

/** A call-to-action on the Pro landing page was clicked. */
export const trackProCta = (cta: { ctaId: string; section: string; destination: string; loggedIn: boolean }) =>
  trackEvent('pro_cta_click', {
    cta_id: cta.ctaId,
    section: cta.section,
    destination: cta.destination,
    logged_in: cta.loggedIn,
  })

/** The billing-period toggle on the Pro landing page was changed. */
export const trackProPeriodChange = (change: { billingPeriod: string; loggedIn: boolean }) =>
  trackEvent('pro_period_change', { billing_period: change.billingPeriod, logged_in: change.loggedIn })

/** An FAQ entry on the Pro landing page was expanded. */
export const trackProFaqOpen = (faq: { question: string; loggedIn: boolean }) =>
  trackEvent('pro_faq_open', { question: faq.question, logged_in: faq.loggedIn })
