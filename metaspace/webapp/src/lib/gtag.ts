import { event as gtagEvent, set as gtagSet, purchase as gtagPurchase } from 'vue-gtag'
import type { RouteLocationNormalized } from 'vue-router'
import { currentUserIdQuery } from '../api/user'
import { getSeoMetaForRoute } from './useSeo'

/**
 * Thin, fail-safe wrappers around vue-gtag.
 *
 * Conventions:
 * - Page views are NOT sent from here. vue-gtag is installed with the router
 *   (see main.ts) and already sends a `page_view` on every navigation. Sending
 *   another one from a page component double-counts it.
 * - Monetary values arrive in cents (that is what the API returns) and are
 *   converted to currency units, which is what GA4 expects in `value`.
 * - Every funnel event carries `logged_in` so anonymous and signed-in traffic
 *   can be compared in GA4 without a User-ID dependency.
 *
 * See ANALYTICS.md for the event catalogue and the GA4 setup steps.
 */

type GtagParams = Record<string, string | number | boolean | null | undefined | Array<Record<string, unknown>>>

const safely = (fn: () => void) => {
  try {
    fn()
  } catch (error) {
    // Analytics must never break the UI (ad-blockers, missing gtag, etc.)
  }
}

const centsToUnits = (cents: number | null | undefined) => Math.round(cents || 0) / 100

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const setUserId = (userId: string) =>
  safely(() => {
    gtagSet({ user_id: userId })
    gtagSet({ user_properties: { metaspace_user_id: userId } })
  })

/** Detach the user id, e.g. after sign-out, so later hits are anonymous. */
export const clearUserId = () =>
  safely(() => {
    gtagSet({ user_id: null })
    gtagSet({ user_properties: { metaspace_user_id: null } })
  })

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

type ApolloLikeClient = { query: (options: { query: any; fetchPolicy?: any }) => Promise<{ data?: any }> }

/**
 * Look up the signed-in user's id before analytics starts, so the first
 * page_view of the session already carries `user_id`. Never rejects: a
 * failed or slow query just means an anonymous start (the header sets the
 * id later once the profile loads).
 */
export const resolveInitialUserId = (client: ApolloLikeClient, timeoutMs = 3000): Promise<string | null> => {
  const lookup = client
    .query({ query: currentUserIdQuery, fetchPolicy: 'cache-first' })
    .then((result) => result?.data?.currentUser?.id ?? null)
    .catch(() => null)
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([lookup, timeout])
}

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
export const buildGtagOptions = (env: { measurementId: string; production: boolean; userId: string | null }) => ({
  config: { id: env.measurementId, params: { user_id: env.userId } },
  // disabled in dev because it impairs "break on uncaught exception", and
  // whenever no measurement id is configured for the environment
  enabled: env.production && env.measurementId !== '',
  pageTrackerTemplate,
})

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------

export const trackEvent = (eventName: string, params?: GtagParams) => safely(() => gtagEvent(eventName, params))

// ---------------------------------------------------------------------------
// Pro / plans funnel
// ---------------------------------------------------------------------------

export const trackPlansPageView = (loggedIn: boolean) =>
  trackEvent('view_plans_page', { section: 'plans', logged_in: loggedIn })

export const trackPaymentPageView = (userId: string | null | undefined, planId?: string) => {
  if (userId) {
    setUserId(userId)
  }
  trackEvent('view_payment_page', { section: 'plans', plan_id: planId || 'unknown', logged_in: !!userId })
}

export const trackSuccessPageView = (userId: string | null | undefined, fromPayment: boolean) => {
  if (userId) {
    setUserId(userId)
  }
  trackEvent('view_success_page', { section: 'plans', from_payment: fromPayment, logged_in: !!userId })
}

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
