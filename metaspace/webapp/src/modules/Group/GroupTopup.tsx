import { computed, defineComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { ElButton } from '../../lib/element-plus'
import { getTopupOptionsQuery, TopupOption, TopupOptionsData } from '../../api/subscription'
import { formatPrice } from '../../lib/pricing'
import { getActionTypeText } from '../../lib/usageActions'

/**
 * "Top up your plan" section of the group Subscription tab. The available
 * sizes and their credit bundles come from the manager service - an empty
 * list means the current plan is not top-uppable, so the whole section hides.
 */
export default defineComponent({
  name: 'GroupTopup',
  props: {
    groupId: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()

    const { result: topupOptionsResult, loading } = useQuery<TopupOptionsData>(
      getTopupOptionsQuery,
      () => ({ groupId: props.groupId }),
      { fetchPolicy: 'network-only' }
    )
    const options = computed<TopupOption[]>(() => topupOptionsResult.value?.topupOptions || [])

    const onBuy = (option: TopupOption) => {
      router.push({
        path: '/payment',
        query: { topupOptionId: option.id, groupId: props.groupId },
      })
    }

    return () => {
      if (loading.value || options.value.length === 0) {
        return null
      }

      return (
        <div class="section" data-test="group-topup">
          <h3 class="section-title">Top up your plan</h3>
          <p class="text-sm text-gray-600 mt-0">
            Extra credits stack on top of your plan limits, are drawn on automatically once a limit is hit, and last
            until your subscription expires.
          </p>
          <div class="flex flex-wrap gap-4">
            {options.value.map((option) => (
              <div
                class="topup-option border border-solid border-gray-200 rounded-lg p-4 min-w-[200px]"
                data-test="topup-option"
                key={option.id}
              >
                <div class="flex items-baseline justify-between gap-3">
                  <span class="font-medium">{option.displayName}</span>
                  <span class="text-lg font-semibold">${formatPrice(option.priceCents)}</span>
                </div>
                <ul class="text-sm text-gray-600 pl-4 my-3">
                  {option.grants.map((grant) => (
                    <li key={`${option.id}-${grant.actionType}`}>
                      +{grant.amount} {getActionTypeText(grant.actionType)}
                    </li>
                  ))}
                </ul>
                <ElButton type="primary" size="small" data-test="buy-topup" onClick={() => onBuy(option)}>
                  Buy
                </ElButton>
              </div>
            ))}
          </div>
          <p class="text-xs text-gray-500">Prices exclude VAT and applicable taxes.</p>
        </div>
      )
    }
  },
})
