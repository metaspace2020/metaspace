import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery, PricingOption } from '../../api/plan'
import { getActiveUserSubscriptionQuery } from '../../api/subscription'
import { countUsersQuery, currentUserIdQuery } from '../../api/user'
import { countDatasetsQuery } from '../../api/dataset'
import { countPublicationsQuery } from '../../api/group'
import { getAvailablePeriods, getPriceForPeriod } from '../../lib/pricing'
import { trackBeginCheckout, trackPlansPageView } from '../../lib/gtag'
import ProHero from './sections/ProHero'
import ProSectionNav from './sections/ProSectionNav'
import ProFeatures from './sections/ProFeatures'
import ProDocs from './sections/ProDocs'
import ProPlans from './sections/ProPlans'
import ProTrust from './sections/ProTrust'
import ProFaq from './sections/ProFaq'
import './ProPage.scss'

export default defineComponent({
  name: 'ProPage',
  setup() {
    const router = useRouter()
    const store = useStore()
    const state = reactive({
      selectedPeriod: null as PricingOption | null,
      radioValue: '',
    })

    const { result: plansResult, loading: plansLoading } = useQuery<AllPlansData>(getPlansQuery)
    const plans = computed(() => plansResult.value?.allPlans || [])

    const { result: subscriptionsResult, loading: subscriptionLoading } = useQuery<any>(
      getActiveUserSubscriptionQuery,
      null,
      { fetchPolicy: 'network-only' }
    )
    const activeSubscription = computed(() => subscriptionsResult.value?.activeUserSubscription)

    const { result: currentUserResult } = useQuery<any>(currentUserIdQuery, null, { fetchPolicy: 'cache-first' })
    const currentUserId = computed(() => currentUserResult.value?.currentUser?.id)

    const { result: userCountResult } = useQuery<any>(countUsersQuery)
    const { result: datasetCountResult } = useQuery<any>(countDatasetsQuery, () => ({
      dFilter: { metadataType: 'Imaging MS' },
    }))
    const { result: publicationCountResult } = useQuery<any>(countPublicationsQuery)

    const userCount = computed(() => userCountResult.value?.countUsers ?? null)
    const datasetCount = computed(() => datasetCountResult.value?.countDatasets ?? null)
    const publicationCount = computed(() => publicationCountResult.value?.countPublications ?? null)

    const isLoading = computed(() => plansLoading.value || subscriptionLoading.value)
    const availablePeriods = computed(() => getAvailablePeriods(plans.value.filter((p) => p.type !== 'pack')))
    const packPlan = computed(() => plans.value.find((p) => p.isActive && p.type === 'pack') || null)

    watch(
      availablePeriods,
      (periods) => {
        if (!state.selectedPeriod && periods.length > 0) {
          const annualOrLonger = [...periods]
            .filter((p) => (p.periodMonths || 0) >= 12)
            .sort((a, b) => a.periodMonths - b.periodMonths)[0]
          state.selectedPeriod = annualOrLonger || periods[0]
          state.radioValue = state.selectedPeriod.displayName
        }
      },
      { immediate: true }
    )

    onMounted(() => {
      store.commit('setThemeVariant', 'pro')
      if (currentUserId.value) {
        trackPlansPageView(currentUserId.value)
      }
    })

    onBeforeUnmount(() => {
      store.commit('setThemeVariant', activeSubscription.value ? 'pro' : 'default')
    })

    const onPeriod = (displayName: string) => {
      state.radioValue = displayName
      const period = availablePeriods.value.find((p) => p.displayName === displayName)
      if (period) {
        state.selectedPeriod = period
      }
    }

    const onSubscribe = (planId: string) => {
      if (currentUserId.value) {
        const plan = plans.value.find((p) => p.id === planId)
        trackBeginCheckout({
          planId,
          planName: plan?.name || 'unknown',
          price: plan && state.selectedPeriod ? getPriceForPeriod(plan, state.selectedPeriod) : 0,
          billingPeriod: state.selectedPeriod?.displayName || 'unknown',
        })
      }
      router.push(`/payment?planId=${planId}`)
    }

    const onBuyPack = (planId: string) => {
      const pricing = packPlan.value?.pricingOptions?.find((po) => po.isActive)
      if (currentUserId.value) {
        trackBeginCheckout({
          planId,
          planName: packPlan.value?.name || 'Dataset pack',
          price: pricing?.priceCents || 0,
          billingPeriod: pricing?.displayName || 'one-time',
        })
      }
      router.push(`/payment?planId=${planId}`)
    }

    return () => (
      <div class="pro-page">
        <ProSectionNav />

        <ProHero
          userCount={userCount.value}
          datasetCount={datasetCount.value}
          publicationCount={publicationCount.value}
        />
        <ProFeatures />
        <ProDocs />
        <ProPlans
          plans={plans.value}
          loading={isLoading.value}
          selectedPeriod={state.selectedPeriod}
          availablePeriods={availablePeriods.value}
          radioValue={state.radioValue}
          activePlanId={activeSubscription.value?.planId || null}
          packPlan={packPlan.value}
          onSubscribe={onSubscribe}
          onBuyPack={onBuyPack}
          onPeriod={onPeriod}
        />
        <ProTrust />
        <ProFaq />
      </div>
    )
  },
})
