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
  { name: 'Ideal For', key: 'ideal', type: 'ideal' },
  { name: 'Maximum Submissions per year', key: 'maxDatasets', type: 'limit' },
  { name: 'Maximum Reprocessing per year', key: 'maxReprocessing', type: 'limit' },
  { name: 'Support', key: 'support', type: 'support' },
  { name: 'Processing Priority', key: 'priority', type: 'priority' },
  { name: 'Group members', key: 'teamMembers', type: 'text' },
  { name: 'Billing', key: 'billing', type: 'billing' },
]

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
        return `$${formatPrice(totalPrice)} / year\nEquivalent to $${formatPrice(monthlyPrice)} / month`
      }
      return '$X / year\nEquivalent to $X / month'

    case 'ideal':
      if (planName.includes('free')) return 'Best for early-stage projects and trial use'
      if (planName.includes('low')) return 'For groups handling a few projects per year'
      if (planName.includes('medium')) return 'Built for groups running large or parallel projects'
      if (planName.includes('high')) return 'Ideal for groups producing high volumes of datasets year-round'
      if (planName.includes('ultra')) return 'Ideal for large groups, core facilities, and enterprise organizations'
      return 'For groups handling a few projects per year'

    case 'maxDatasets':
      if (planName.includes('free')) return '3 datasets / year'
      if (planName.includes('low')) return '30 datasets / year'
      if (planName.includes('medium')) return '100 datasets / year'
      if (planName.includes('high')) return '300 datasets / year'
      if (planName.includes('ultra')) return '1,000 datasets / year'
      return '30 datasets / year'

    case 'maxReprocessing':
      if (planName.includes('free')) return '6 reprocessing / year'
      if (planName.includes('low')) return '60 reprocessing / year'
      if (planName.includes('medium')) return '200 reprocessing / year'
      if (planName.includes('high')) return '600 reprocessing / year'
      if (planName.includes('ultra')) return '2,000 reprocessing / year'
      return '30 reprocessing / year'

    case 'support':
      if (planName.includes('free')) return 'Email replies within 72 hours'
      if (planName.includes('low')) return 'Email replies within 72 hours'
      if (planName.includes('medium')) return 'Email replies within 24 hours'
      if (planName.includes('high')) return 'Email replies within 12 hours'
      if (planName.includes('ultra')) return 'Email replies within 12 hours'
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

                        <div class="billing-info">Billed each {getPeriodDisplayName(state.selectedPeriod)}</div>

                        <div class="plan-features">
                          <div class="safe-html" innerHTML={plan.description} />
                        </div>

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
                          return <span class="feature-text">{value}</span>
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
