import { defineComponent, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton } from '../../lib/element-plus'
import './PlansPage.scss'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery } from '../../api/plan'

export default defineComponent({
  name: 'PlansPage',
  setup() {
    const router = useRouter()
    const state = reactive({
      hoveredPlan: 2,
    })

    const { result: plansResult } = useQuery<AllPlansData>(getPlansQuery)
    const plans = computed(() => plansResult.value?.allPlans || [])

    const handleStartTrial = (planId: number) => {
      router.push(`/payment?planId=${planId}`)
    }

    const formatPrice = (price: number) => {
      return (price / 100).toFixed(2)
    }

    return () => {
      const sortedPlans = [...plans.value].sort((a, b) => a.order - b.order)

      return (
        <div class="page-wrapper">
          <div class="plans-container">
            <h1 class="plans-title">Pricing</h1>

            <div class="plans-grid">
              {sortedPlans
                .filter((plan) => plan.isActive)
                .map((plan, index) => (
                  <div
                    key={plan.id}
                    onMouseover={() => (state.hoveredPlan = index)}
                    class="plan-card"
                    style={{
                      border: state.hoveredPlan === index ? '1px solid #4285f4' : '1px solid #eee',
                    }}
                  >
                    <h2 class="plan-name">{plan.name}</h2>
                    <div class="plan-price">
                      <span class="price-currency">$</span>
                      <span class="price-amount">{formatPrice(plan.price)}</span>
                      <span class="price-period">/annually</span>
                    </div>
                    <div class="plan-features">
                      <div class="safe-html" innerHTML={plan.description} />
                    </div>
                    {plan.price === 0 ? (
                      <div class="start-button">Already enjoying the benefits!</div>
                    ) : (
                      <ElButton
                        class="start-button"
                        type={state.hoveredPlan === index ? 'primary' : 'default'}
                        onClick={() => handleStartTrial(plan.id)}
                        size="default"
                      >
                        Subscribe
                      </ElButton>
                    )}
                  </div>
                ))}
            </div>
            <div class="vat-notice">*VAT included on all prices shown.</div>
          </div>
        </div>
      )
    }
  },
})
