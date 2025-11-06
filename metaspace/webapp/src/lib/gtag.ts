import { event as gtagEvent, pageview as gtagPageview, set as gtagSet, purchase as gtagPurchase } from 'vue-gtag'

// Set user ID for tracking across all events
export const setUserId = (userId: string) => {
  try {
    gtagSet({ user_id: userId })
  } catch (error) {
    // pass silently
  }
}

// Track page views with consistent structure
export const trackPageView = (pageName: string, pagePath: string, additionalParams?: Record<string, any>) => {
  try {
    gtagPageview({
      page_title: pageName,
      page_location: window.location.href,
      page_path: pagePath,
      ...additionalParams,
    })
  } catch (error) {
    // pass silently
  }
}

// Track custom events with consistent structure
export const trackEvent = (eventName: string, params?: Record<string, any>) => {
  try {
    gtagEvent(eventName, params)
  } catch (error) {
    // pass silently
  }
}

// Plans-specific tracking functions
export const trackPlansPageView = (userId?: string) => {
  try {
    if (userId) {
      setUserId(userId)
    }

    trackPageView('Plans Page', '/plans')
    trackEvent('view_plans_page', {
      section: 'plans',
      action: 'view_plans_page',
    })
  } catch (error) {
    // pass silently
  }
}

export const trackBeginCheckout = (planData: {
  planId: string
  planName: string
  price: number
  billingPeriod: string
}) => {
  try {
    trackEvent('begin_checkout', {
      currency: 'USD',
      value: planData?.price,
      section: 'plans',
      action: 'navigate_to_payment',
      plan_id: planData?.planId,
      plan_name: planData?.planName,
      billing_period: planData?.billingPeriod,
    })
  } catch (error) {
    // pass silently
  }
}

export const trackPaymentPageView = (userId: string, planId?: string) => {
  try {
    setUserId(userId)
    trackPageView('Payment Page', '/payment')
    trackEvent('view_payment_page', {
      section: 'plans',
      action: 'view_payment_page',
      plan_id: planId || 'unknown',
    })
  } catch (error) {
    // pass silently
  }
}

export const trackSuccessPageView = (userId: string, fromPayment: boolean) => {
  try {
    setUserId(userId)
    trackPageView('Success Page', '/success')
    trackEvent('view_success_page', {
      section: 'plans',
      action: 'view_success_page',
      from_payment: fromPayment,
    })
  } catch (error) {
    // pass silently
  }
}

export const trackPurchaseComplete = (purchaseData: {
  transactionId: string
  value: number
  planId: string
  planName: string
  subscriptionId?: string
}) => {
  try {
    gtagPurchase({
      transaction_id: purchaseData?.transactionId,
      value: purchaseData?.value,
      items: [
        {
          id: purchaseData?.planId,
          name: purchaseData?.planName,
          category: 'subscription',
          quantity: 1,
          price: purchaseData?.value,
        },
      ],
    })

    // Also track as custom event for additional context
    trackEvent('purchase_complete', {
      section: 'plans',
      action: 'purchase_complete',
      transaction_id: purchaseData?.transactionId,
      subscription_id: purchaseData?.subscriptionId || 'unknown',
      plan_name: purchaseData?.planName,
      value: purchaseData?.value,
    })
  } catch (error) {
    // pass silently
  }
}
