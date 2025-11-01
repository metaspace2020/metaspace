import { defineComponent, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import {
  ElButton,
  ElRadioGroup,
  ElRadioButton,
  ElTable,
  ElTableColumn,
  ElSkeleton,
  ElSkeletonItem,
} from '../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery, PricingOption, Plan } from '../../api/plan'
import {
  formatPrice,
  getPriceForPeriod,
  getMonthlyPrice,
  getPeriodDisplayName,
  getAvailablePeriods,
} from '../../lib/pricing'
import { getActiveUserSubscriptionQuery } from '../../api/subscription'
import './PlansPage.scss'

// Define comparison features based on the sketch
interface ComparisonFeature {
  name: string
  key: string
  type: 'boolean' | 'text' | 'limit' | 'price' | 'ideal' | 'support' | 'priority' | 'billing'
}

const comparisonFeatures: ComparisonFeature[] = [
  { name: 'Price', key: 'price', type: 'price' },
  { name: 'Maximum Private Submissions per Year', key: 'maxDatasets', type: 'limit' },
  { name: 'Maximum Private Reprocessings per Year', key: 'maxReprocessing', type: 'limit' },
  { name: 'Support Channels', key: 'supportChannels', type: 'text' },
  { name: 'Support Response Time', key: 'support', type: 'support' },
  { name: 'Dedicated Training', key: 'training', type: 'text' },
  { name: 'Early Feature Access', key: 'earlyFeatureAccess', type: 'text' },
  { name: 'Group Members', key: 'groupMembers', type: 'text' },
  { name: 'Projects', key: 'projects', type: 'text' },
]

// Helper function to get discount information for early bird promotion
const getDiscountInfo = (planName: string, selectedPeriod: PricingOption | null) => {
  if (!selectedPeriod) return null

  const planLower = planName.toLowerCase()
  const periodMonths = selectedPeriod.periodMonths || 12

  // Only show discount for subscriptions before end of 2025
  const currentDate = new Date()
  const endOf2025 = new Date('2025-12-31')
  if (currentDate > endOf2025) return null

  let discount = 0
  let planCode = ''

  // Determine plan code and discount based on plan name and period
  if (planLower.includes('low')) {
    planCode = 'LOW'
    discount = periodMonths === 12 ? 50 : periodMonths === 24 ? 40 : 0
  } else if (planLower.includes('medium')) {
    planCode = 'MEDIUM'
    discount = periodMonths === 12 ? 40 : periodMonths === 24 ? 30 : 0
  } else if (planLower.includes('high')) {
    planCode = 'HIGH'
    discount = periodMonths === 12 ? 35 : periodMonths === 24 ? 25 : 0
  } else if (planLower.includes('ultra')) {
    planCode = 'ULTRA'
    if (periodMonths === 12) discount = 30
    else if (periodMonths === 24) discount = 20
    else if (periodMonths === 36) discount = 10
  }

  if (discount === 0) return null

  const periodText =
    periodMonths === 12
      ? '1 year'
      : periodMonths === 24
      ? '2 years'
      : periodMonths === 36
      ? '3 years'
      : `${periodMonths} months`

  return {
    discount,
    couponCode: `EARLYBIRD${planCode}${parseFloat(Math.floor(periodMonths / 12).toString()).toFixed(0)}`,
    period: periodText,
  }
}

// Helper function to get feature value for a plan
const getFeatureValue = (plan: Plan, featureKey: string, selectedPeriod?: PricingOption): string | boolean => {
  // This is a simplified implementation - you may need to adjust based on your actual plan data structure
  const planName = plan.name.toLowerCase()

  switch (featureKey) {
    case 'price':
      if (planName.includes('free')) return '$0 / year\nEquivalent to $0 / month'
      if (selectedPeriod) {
        const totalPrice = getPriceForPeriod(plan, selectedPeriod)
        const monthlyPrice = getMonthlyPrice(plan, selectedPeriod)
        return `$${formatPrice(totalPrice)} / ${selectedPeriod.displayName}\nEquivalent to $${formatPrice(
          monthlyPrice
        )} / month`
      }
      return '$X / year\nEquivalent to $X / month'

    case 'ideal':
      if (planName.includes('free')) return 'Trial use'
      if (planName.includes('low'))
        return 'Small groups with one mass spectrometer, or for extended trial before upgrading'
      if (planName.includes('medium')) return 'Medium-size groups with one mass spectrometer'
      if (planName.includes('high'))
        return 'Large groups with multiple mass spectrometers, core facilities, service providers'
      if (planName.includes('ultra')) return 'Powerhouses of the field '
      return 'Trial use'

    case 'maxDatasets':
      if (planName.includes('free')) return '3 datasets / year'
      if (planName.includes('low')) return '30 datasets / year'
      if (planName.includes('medium')) return '100 datasets / year'
      if (planName.includes('high')) return '300 datasets / year'
      if (planName.includes('ultra'))
        return '1,000 datasets / year*  <br><span class="text-xs text-gray-500">Contact us if more is required</span>'
      return '30 datasets / year'

    case 'maxReprocessing':
      if (planName.includes('free')) return '6 reprocessing / year'
      if (planName.includes('low')) return '60 reprocessing / year'
      if (planName.includes('medium')) return '200 reprocessing / year'
      if (planName.includes('high')) return '600 reprocessing / year'
      if (planName.includes('ultra'))
        return (
          '2,000 reprocessing / year*  <br><span class="text-xs text-gray-500">' +
          'Contact us if more is required</span>'
        )
      return '30 reprocessing / year'

    case 'support':
      if (planName.includes('free')) return '3 working days'
      if (planName.includes('low')) return '2 working days'
      if (planName.includes('medium')) return '24 hours'
      if (planName.includes('high')) return 'Email replies within 24h; chat sessions bookable within 24h (Mon–Fri)'
      if (planName.includes('ultra')) return 'Email replies within 12h; chat sessions bookable same day (5 days)'
      return 'Community and email support'

    case 'priority':
      if (planName.includes('free')) return 'Low'
      if (planName.includes('low')) return 'Medium'
      if (planName.includes('medium')) return 'High'
      if (planName.includes('high')) return 'High'
      if (planName.includes('ultra')) return 'Top'
      return 'Medium'

    case 'teamMembers':
      return 'Unlimited'

    case 'billing':
      if (planName.includes('free')) return 'No payment required'
      return 'Annual payment required'

    case 'training':
      if (planName.includes('free')) return 'Not included'
      if (planName.includes('low')) return 'Not included'
      if (planName.includes('medium')) return 'For basic functionality'
      if (planName.includes('high')) return 'For advanced functionality'
      if (planName.includes('ultra')) return 'End-to-end personalized training'
      return 'Not included'

    case 'earlyFeatureAccess':
      if (planName.includes('free')) return 'Not included'
      if (planName.includes('low')) return 'Not included'
      if (planName.includes('medium')) return 'Limited early access'
      if (planName.includes('high')) return 'Full early access'
      if (planName.includes('ultra')) return 'Full early access + influence on roadmap'
      return 'Not included'

    case 'maxGroups':
      return '3'

    case 'projects':
      return 'Unlimited'

    case 'groupMembers':
      return 'Unlimited'

    case 'supportChannels':
      if (planName.includes('free')) return 'Email'
      if (planName.includes('low')) return 'Email'
      if (planName.includes('medium')) return 'Email'
      if (planName.includes('high')) return 'Email + 1:1 live chat'
      if (planName.includes('ultra')) return 'Email + 1:1 live chat'
      return 'Email'

    default:
      return false
  }
}

export default defineComponent({
  name: 'PlansPage',
  setup() {
    const router = useRouter()
    const store = useStore()
    const state = reactive({
      hoveredPlan: 2,
      selectedPeriod: null as PricingOption | null, // Will be set after availablePeriods is computed
      radioValue: '1 year', // Separate state for radio group, using display name
    })

    // Set pro theme on mount
    onMounted(() => {
      store.commit('setThemeVariant', 'pro')
    })

    // Reset to default theme on unmount
    onBeforeUnmount(() => {
      if (activeSubscription.value) {
        store.commit('setThemeVariant', 'pro')
      } else {
        store.commit('setThemeVariant', 'default')
      }
    })

    const { result: plansResult, loading: plansLoading } = useQuery<AllPlansData>(getPlansQuery)
    const plans = computed(() => plansResult.value?.allPlans || [])

    const { result: subscriptionsResult, loading: subscriptionLoading } = useQuery<any>(
      getActiveUserSubscriptionQuery,
      null,
      {
        fetchPolicy: 'network-only',
      }
    )
    const activeSubscription = computed(() => subscriptionsResult.value?.activeUserSubscription)

    const isLoading = computed(() => plansLoading.value || subscriptionLoading.value)

    // Get all unique periods from all plans as objects
    const availablePeriods = computed(() => getAvailablePeriods(plans.value))

    // Set default selected period when availablePeriods changes
    watch(
      availablePeriods,
      (periods) => {
        if (!state.selectedPeriod && periods.length > 0) {
          // Default to yearly if available, otherwise first available
          const yearly = periods.find((p) => p.displayName.toLowerCase() === 'yearly')
          state.selectedPeriod = yearly || periods[0]
          state.radioValue = state.selectedPeriod.displayName
        }
      },
      { immediate: true }
    )

    // Update selectedPeriod when radio value changes
    watch(
      () => state.radioValue,
      (newValue) => {
        const period = availablePeriods.value.find((p) => p.displayName === newValue)
        if (period) {
          state.selectedPeriod = period
        }
      }
    )

    const handleSubscribe = (planId: string) => {
      router.push(`/payment?planId=${planId}`)
    }

    return () => {
      const sortedPlans = [...plans.value].sort((a, b) => a.displayOrder - b.displayOrder)
      const activePlans = sortedPlans.filter((plan) => plan.isActive)
      const paidPlans = activePlans.filter((plan) => !plan.name.toLowerCase().includes('free'))

      return (
        <div class="page-wrapper">
          {/* Temporary Limits Banner */}
          <div class="limits-banner">
            <div class="limits-banner-content">
              <b>NOTICE:</b> Medium Plan limits will remain in effect by default until <b>February 3, 2026</b>, after
              which the Free Plan limits shall apply automatically.
            </div>
          </div>
          <div class="plans-container">
            <h1 class="plans-title">Choose a plan that works for you</h1>
            <p class="plans-subtitle">
              Each plan is tailored to your specific needs <br />
              <span class="text-sm">
                To understand the differences between the METASPACE Academic and METASPACE Pro,{' '}
                <RouterLink to="/split" class="text-blue-600 hover:text-blue-800 underline">
                  click here
                </RouterLink>{' '}
              </span>
            </p>
            {/* Pricing Period Toggle */}
            <div class="pricing-toggle">
              {isLoading.value ? (
                <ElSkeleton animated>
                  <ElSkeletonItem style={{ width: '200px', height: '40px' }} />
                </ElSkeleton>
              ) : (
                <ElRadioGroup
                  modelValue={state.radioValue}
                  onChange={(value: string) => {
                    state.radioValue = value
                  }}
                  text-color="var(--primary-color)"
                  fill="white"
                  size="large"
                >
                  {availablePeriods.value.map((period) => (
                    <ElRadioButton key={period.id} label={period.displayName} />
                  ))}
                </ElRadioGroup>
              )}
            </div>

            <div class="plans-grid">
              {isLoading.value
                ? // Show skeleton loading for 3 plan cards
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={`skeleton-${index}`} class="plan-card">
                      <ElSkeleton animated>
                        <ElSkeletonItem style={{ width: '60%', height: '20px', marginBottom: '16px' }} />
                        <ElSkeletonItem style={{ width: '80%', height: '48px', marginBottom: '8px' }} />
                        <ElSkeletonItem style={{ width: '70%', height: '16px', marginBottom: '24px' }} />
                        <ElSkeletonItem style={{ width: '100%', height: '120px', marginBottom: '24px' }} />
                        <ElSkeletonItem style={{ width: '100%', height: '40px' }} />
                      </ElSkeleton>
                    </div>
                  ))
                : paidPlans.map((plan, index) => {
                    if (!state.selectedPeriod) return null
                    const isActiveSubscription = activeSubscription.value?.planId === plan.id
                    const totalPrice = getPriceForPeriod(plan, state.selectedPeriod)
                    const isRecommended = index === 2 // MEDIUM plan (index 1) is highlighted in the image

                    return (
                      <div
                        key={plan.id}
                        onMouseover={() => (state.hoveredPlan = index)}
                        onMouseout={() => (state.hoveredPlan = -1)}
                        class={`plan-card ${state.hoveredPlan === index ? 'border-pro' : ''}`}
                      >
                        {isRecommended && <div class="recommended-badge">Recommended for most users</div>}

                        <h2 class="plan-name">{plan.name}</h2>

                        <div class="plan-price">
                          <span class="price-currency">$</span>
                          <span class="price-amount">{formatPrice(totalPrice)}</span>
                          <span class="price-period">/{getPeriodDisplayName(state.selectedPeriod).toLowerCase()}</span>
                        </div>

                        <div class="billing-info">Billed every {getPeriodDisplayName(state.selectedPeriod)}</div>
                        <div class="plan-features">
                          <div class="safe-html text-center" innerHTML={plan.description} />
                        </div>
                        {/* Early Bird Discount Notice */}
                        {(() => {
                          const discountInfo = getDiscountInfo(plan.name, state.selectedPeriod)
                          if (!discountInfo) return null

                          return (
                            <div class="discount-notice">
                              <div class="discount-badge">
                                <span class="discount-text">Early Bird Special!</span>
                              </div>
                              <div class="discount-details">
                                Apply coupon <strong>{discountInfo.couponCode}</strong> at checkout to get{' '}
                                <strong>{discountInfo.discount}% discount</strong> for {discountInfo.period}
                              </div>
                              <div class="discount-expiry">Valid until December 31st, 2025</div>
                            </div>
                          )
                        })()}

                        {isActiveSubscription ? (
                          <div class="start-button text-center flex items-center justify-center">
                            Already enjoying the benefits!
                          </div>
                        ) : (
                          <ElButton
                            class={`start-button ${isRecommended ? 'primary' : 'outline'}`}
                            type={isRecommended ? 'primary' : 'default'}
                            onClick={() => handleSubscribe(plan.id)}
                            size="default"
                          >
                            Subscribe
                          </ElButton>
                        )}
                      </div>
                    )
                  })}
            </div>

            {/* Comparison Table */}
            <div class="comparison-section">
              {isLoading.value ? (
                <ElSkeleton animated>
                  <ElSkeletonItem style={{ width: '100%', height: '40px', marginBottom: '16px' }} />
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={`table-row-${index}`} style={{ display: 'flex', marginBottom: '12px' }}>
                      <ElSkeletonItem style={{ width: '25%', height: '24px', marginRight: '16px' }} />
                      <ElSkeletonItem style={{ width: '20%', height: '24px', marginRight: '16px' }} />
                      <ElSkeletonItem style={{ width: '20%', height: '24px', marginRight: '16px' }} />
                      <ElSkeletonItem style={{ width: '20%', height: '24px', marginRight: '16px' }} />
                      <ElSkeletonItem style={{ width: '15%', height: '24px' }} />
                    </div>
                  ))}
                </ElSkeleton>
              ) : (
                <ElTable data={comparisonFeatures} class="comparison-table">
                  <ElTableColumn prop="name" label="Features" />
                  {activePlans.map((plan) => (
                    <ElTableColumn key={plan.id} label={plan.name}>
                      {{
                        default: ({ row }: { row: ComparisonFeature }) => {
                          const value = getFeatureValue(plan, row.key, state.selectedPeriod)
                          if (typeof value === 'boolean') {
                            return value ? <span class="feature-check">✓</span> : <span class="feature-x">✗</span>
                          }
                          // Handle multi-line text (like price with line breaks)
                          if (typeof value === 'string' && value.includes('\n')) {
                            const lines = value.split('\n')
                            return (
                              <div class="feature-multiline">
                                {lines.map((line, index) => (
                                  <div key={index} class="feature-line">
                                    {line}
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          return (
                            <span class="feature-text">
                              <div class="safe-html break-keep" innerHTML={value} />
                            </span>
                          )
                        },
                      }}
                    </ElTableColumn>
                  ))}
                </ElTable>
              )}
            </div>
          </div>
        </div>
      )
    }
  },
})
