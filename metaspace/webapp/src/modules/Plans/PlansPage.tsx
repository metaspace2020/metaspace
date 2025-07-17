import { defineComponent, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElSelect, ElOption } from '../../lib/element-plus'
import './PlansPage.scss'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery } from '../../api/plan'

export default defineComponent({
  name: 'PlansPage',
  setup() {
    const router = useRouter()
    const state = reactive({
      hoveredPlan: 2,
      selectedPeriods: {} as Record<string, string>,
    })

    const { result: plansResult } = useQuery<AllPlansData>(getPlansQuery)
    const plans = computed(() => plansResult.value?.allPlans || [])

    const handleSubscribe = (planId: string) => {
      router.push(`/payment?planId=${planId}`)
    }

    const formatPrice = (priceCents: number | undefined) => {
      if (priceCents === undefined) return '0.00'
      return (priceCents / 100).toFixed(2)
    }

    const getDefaultPricingOption = (planId: string) => {
      const plan = plans.value.find((p) => p.id === planId)
      if (!plan?.pricingOptions?.length) return null
      const yearlyOption = plan.pricingOptions.find((po) => po.periodMonths === 12)
      return yearlyOption || plan.pricingOptions[0]
    }

    // Initialize selected periods with default values
    const initializeSelectedPeriods = () => {
      plans.value.forEach((plan) => {
        const defaultOption = getDefaultPricingOption(plan.id)
        if (defaultOption) {
          state.selectedPeriods[plan.id] = defaultOption.id
        }
      })
    }

    // Watch for plans data and initialize selected periods
    watch(
      () => plans.value,
      (newPlans) => {
        if (newPlans.length > 0) {
          initializeSelectedPeriods()
        }
      },
      { immediate: true }
    )

    return () => {
      const sortedPlans = [...plans.value].sort((a, b) => a.displayOrder - b.displayOrder)

      return (
        <div class="page-wrapper">
          <div class="plans-container">
            <h1 class="plans-title">Pricing</h1>

            <div class="plans-grid">
              {sortedPlans
                .filter((plan) => plan.isActive)
                .map((plan, index) => {
                  const selectedPricingOption = plan.pricingOptions?.find(
                    (po) => po.id === state.selectedPeriods[plan.id]
                  )

                  return (
                    <div
                      key={plan.id}
                      onMouseover={() => (state.hoveredPlan = index)}
                      class="plan-card"
                      style={{
                        border: state.hoveredPlan === index ? '1px solid #4285f4' : '1px solid #eee',
                      }}
                    >
                      <h2 class="plan-name">{plan.name}</h2>
                      {plan.pricingOptions?.length > 0 ? (
                        <div class="plan-pricing">
                          <div class="plan-price">
                            <span class="price-currency">$</span>
                            <span class="price-amount">{formatPrice(selectedPricingOption?.priceCents)}</span>
                            <span class="price-period">/{selectedPricingOption?.displayName.toLowerCase()}</span>
                          </div>
                          <ElSelect v-model={state.selectedPeriods[plan.id]} class="period-selector" size="small">
                            {plan.pricingOptions
                              .filter((po) => po.isActive)
                              .sort((a, b) => a.displayOrder - b.displayOrder)
                              .map((option) => (
                                <ElOption key={option.id} value={option.id} label={option.displayName} />
                              ))}
                          </ElSelect>
                        </div>
                      ) : (
                        <div class="plan-price">
                          <span class="price-currency">$</span>
                          <span class="price-amount">0.00</span>
                          <span class="price-period">/month</span>
                        </div>
                      )}
                      <div class="plan-features">
                        <div class="safe-html" innerHTML={plan.description} />
                      </div>
                      {plan.pricingOptions?.length === 0 ? (
                        <div class="start-button">Already enjoying the benefits!</div>
                      ) : (
                        <ElButton
                          class="start-button"
                          type={state.hoveredPlan === index ? 'primary' : 'default'}
                          onClick={() => handleSubscribe(plan.id, selectedPricingOption)}
                          size="default"
                        >
                          Subscribe
                        </ElButton>
                      )}
                    </div>
                  )
                })}
            </div>
            <div class="vat-notice">*VAT included on all prices shown.</div>
          </div>
        </div>
      )
    }
  },
})
