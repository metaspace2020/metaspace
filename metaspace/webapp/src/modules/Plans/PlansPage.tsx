import { defineComponent, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElRadioGroup, ElRadioButton } from '../../lib/element-plus'
import './PlansPage.scss'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery, PricingOption } from '../../api/plan'
import {
  formatPrice,
  getPriceForPeriod,
  getMonthlyPrice,
  getPeriodDisplayName,
  getAvailablePeriods,
} from '../../lib/pricing'
import { getActiveUserSubscriptionQuery } from '../../api/subscription'

export default defineComponent({
  name: 'PlansPage',
  setup() {
    const router = useRouter()
    const state = reactive({
      hoveredPlan: 2,
      selectedPeriod: null as PricingOption | null, // Will be set after availablePeriods is computed
      radioValue: 'Yearly', // Separate state for radio group, using display name
    })

    const { result: plansResult } = useQuery<AllPlansData>(getPlansQuery)
    const plans = computed(() => plansResult.value?.allPlans || [])

    const { result: subscriptionsResult } = useQuery<any>(getActiveUserSubscriptionQuery)
    const activeSubscription = computed(() => subscriptionsResult.value?.activeUserSubscription)

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
      const sortedPlans = [...plans.value].filter((p) => !p.isDefault).sort((a, b) => a.displayOrder - b.displayOrder)

      return (
        <div class="page-wrapper">
          <div class="plans-container">
            <h1 class="plans-title">Pricing</h1>

            {/* Pricing Period Toggle */}
            <div class="pricing-toggle">
              <ElRadioGroup
                modelValue={state.radioValue}
                onChange={(value: string) => {
                  state.radioValue = value
                }}
                size="large"
              >
                {availablePeriods.value.map((period) => (
                  <ElRadioButton key={period.id} label={period.displayName} class="toggle-option" />
                ))}
              </ElRadioGroup>
            </div>

            <div class="plans-grid">
              {sortedPlans
                .filter((plan) => plan.isActive)
                .map((plan, index) => {
                  if (!state.selectedPeriod) return null
                  const isActiveSubscription = activeSubscription.value?.planId === plan.id

                  const monthlyPrice = getMonthlyPrice(plan, state.selectedPeriod)
                  const totalPrice = getPriceForPeriod(plan, state.selectedPeriod)
                  const pricingOptions = plan?.pricingOptions || []
                  let savingsPercentage: number = 100 - (monthlyPrice * 100) / getMonthlyPrice(plan, pricingOptions[0])
                  const isRecommended = index === 2 // HIGH plan (index 2) is highlighted in the image
                  savingsPercentage = savingsPercentage > 0 ? Number(savingsPercentage.toFixed(0)) : 0

                  return (
                    <div
                      key={plan.id}
                      onMouseover={() => (state.hoveredPlan = index)}
                      onMouseout={() => (state.hoveredPlan = -1)}
                      class="plan-card"
                      style={{
                        border: state.hoveredPlan === index ? '2px solid #0F87EF' : '1px solid #eee',
                      }}
                    >
                      <h2 class="plan-name">{plan.name}</h2>

                      <div class="plan-price">
                        <span class="price-currency">$</span>
                        <span class="price-amount">{formatPrice(totalPrice)}</span>
                        <span class="price-period">/{getPeriodDisplayName(state.selectedPeriod).toLowerCase()}</span>
                      </div>

                      <div class="savings-badge" style={{ visibility: savingsPercentage > 0 ? 'visible' : 'hidden' }}>
                        Save {savingsPercentage}%
                      </div>

                      <div class="billing-info">
                        Billed {getPeriodDisplayName(state.selectedPeriod)} • ${formatPrice(totalPrice)} total
                      </div>

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
          </div>
        </div>
      )
    }
  },
})
