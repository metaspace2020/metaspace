import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useQuery } from '@vue/apollo-composable'
import { AllPlansData, getPlansQuery, PricingOption } from '../../api/plan'
import { getActiveUserSubscriptionQuery } from '../../api/subscription'
import { countUsersQuery, currentUserIdQuery } from '../../api/user'
import { countDatasetsQuery } from '../../api/dataset'
import { countPublicationsQuery } from '../../api/group'
import { getAvailablePeriods, getPriceForPeriod, getPricingOptionForPeriod } from '../../lib/pricing'
import {
  trackBeginCheckout,
  trackPlansPageView,
  trackProCta,
  trackProFaqOpen,
  trackProPeriodChange,
} from '../../lib/gtag'
import config from '../../lib/config'
import { blackFridayAt, CAMPAIGNS, couponFor, getActiveCampaigns, termForMonths } from './campaign'
import { resolveTier } from './proContent'
import ProCyberMondayClaim from './sections/ProCyberMondayClaim'
import ProCampaignBanner from './sections/ProCampaignBanner'
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

    // The page is prerendered: `now` stays null until mounted, so the static HTML never contains a campaign.
    const now = ref<Date | null>(null)
    // Preview before the dates: `?feat=promo` shows both campaigns, `promo1` Black Friday only, `promo2` Cyber Monday only.
    const preview = reactive({ blackFriday: false, cyberMonday: false })
    const campaigns = computed(() => {
      if (!now.value) {
        return { blackFriday: null, cyberMonday: null }
      }
      const live = getActiveCampaigns(now.value)
      return {
        blackFriday: live.blackFriday || (preview.blackFriday ? blackFridayAt(now.value) : null),
        cyberMonday: live.cyberMonday || (preview.cyberMonday ? CAMPAIGNS.cyberMonday : null),
      }
    })

    const { result: subscriptionsResult, loading: subscriptionLoading } = useQuery<any>(
      getActiveUserSubscriptionQuery,
      null,
      { fetchPolicy: 'network-only' }
    )
    const activeSubscription = computed(() => subscriptionsResult.value?.activeUserSubscription)

    const { result: currentUserResult, loading: currentUserLoading } = useQuery<any>(currentUserIdQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUserId = computed(() => currentUserResult.value?.currentUser?.id)
    const loggedIn = computed(() => !!currentUserId.value)

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

    // From 768px the banners stick under the site header; the section nav and the scroll offsets then clear
    // their measured height. Below that, or with no banner, the offset is 0 and the page is as it always was.
    const pageEl = ref<HTMLElement | null>(null)
    const campaignOffset = ref(0)
    const measureBanners = () => {
      const banners = pageEl.value?.querySelector('.pro-campaign-banners')
      campaignOffset.value =
        banners && window.innerWidth >= 768 ? Math.round(banners.getBoundingClientRect().height) : 0
    }

    onMounted(() => {
      store.commit('setThemeVariant', 'pro')
      const features = config.features as Record<string, boolean>
      preview.blackFriday = !!(features.promo || features.promo1)
      preview.cyberMonday = !!(features.promo || features.promo2)
      now.value = new Date()
      window.addEventListener('resize', measureBanners)
    })

    watch(campaigns, measureBanners, { flush: 'post' })

    let plansViewTracked = false
    watch(
      () => currentUserLoading.value,
      (loading) => {
        if (!loading && !plansViewTracked) {
          plansViewTracked = true
          trackPlansPageView(loggedIn.value)
        }
      },
      { immediate: true }
    )

    const onCtaClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-cta]') as HTMLElement | null
      if (!target) {
        return
      }
      const sectionEl = target.closest('[data-cta-section], section[id]') as HTMLElement | null
      trackProCta({
        ctaId: target.dataset.cta || 'unknown',
        section: sectionEl?.dataset.ctaSection || sectionEl?.id || 'unknown',
        destination: target.getAttribute('href') || target.dataset.ctaDestination || '',
        loggedIn: loggedIn.value,
      })
    }

    const onFaqOpen = (question: string) => {
      trackProFaqOpen({ question, loggedIn: loggedIn.value })
    }

    onBeforeUnmount(() => {
      window.removeEventListener('resize', measureBanners)
      store.commit('setThemeVariant', activeSubscription.value ? 'pro' : 'default')
    })

    const onPeriod = (displayName: string) => {
      state.radioValue = displayName
      const period = availablePeriods.value.find((p) => p.displayName === displayName)
      if (period) {
        state.selectedPeriod = period
      }
      trackProPeriodChange({ billingPeriod: displayName, loggedIn: loggedIn.value })
    }

    /** `/payment?planId=<id>`, plus the pricing option and Black Friday code when the clicked plan shows one. */
    const checkoutUrl = (planId: string, pricingId?: string, code?: string): string =>
      code && pricingId
        ? `/payment?planId=${planId}&pricingId=${pricingId}&coupon=${encodeURIComponent(code)}`
        : `/payment?planId=${planId}`

    const onSubscribe = (planId: string) => {
      const plan = plans.value.find((p) => p.id === planId)
      trackBeginCheckout({
        planId,
        planName: plan?.name || 'unknown',
        priceCents: plan && state.selectedPeriod ? getPriceForPeriod(plan, state.selectedPeriod) : 0,
        billingPeriod: state.selectedPeriod?.displayName || 'unknown',
        loggedIn: loggedIn.value,
      })
      const pricingOption = plan && state.selectedPeriod ? getPricingOptionForPeriod(plan, state.selectedPeriod) : null
      const tier = plan ? resolveTier(plan) : null
      const code = tier
        ? couponFor(
            campaigns.value.blackFriday,
            tier,
            termForMonths(state.selectedPeriod?.periodMonths),
            plan,
            !!pricingOption,
            activeSubscription.value?.planId || null
          )
        : null
      router.push(checkoutUrl(planId, pricingOption?.id, code?.code))
    }

    const onBuyPack = (planId: string) => {
      const pricing = packPlan.value?.pricingOptions?.find((po) => po.isActive)
      trackBeginCheckout({
        planId,
        planName: packPlan.value?.name || 'Dataset pack',
        priceCents: pricing?.priceCents || 0,
        billingPeriod: pricing?.displayName || 'one-time',
        loggedIn: loggedIn.value,
      })
      const code = couponFor(
        campaigns.value.blackFriday,
        'pack',
        null,
        packPlan.value,
        !!pricing,
        activeSubscription.value?.planId || null
      )
      router.push(checkoutUrl(planId, pricing?.id, code?.code))
    }

    return () => (
      <div
        class="pro-page"
        ref={pageEl}
        style={campaignOffset.value ? { '--pro-campaign-offset': `${campaignOffset.value}px` } : undefined}
        onClick={onCtaClick}
      >
        <ProCampaignBanner blackFriday={campaigns.value.blackFriday} cyberMonday={campaigns.value.cyberMonday} />
        <ProSectionNav />

        <ProHero
          userCount={userCount.value}
          datasetCount={datasetCount.value}
          publicationCount={publicationCount.value}
        />
        <ProFeatures>
          {{
            afterAnalysis: () =>
              campaigns.value.cyberMonday ? (
                <ProCyberMondayClaim
                  cyberMonday={campaigns.value.cyberMonday}
                  blackFriday={campaigns.value.blackFriday}
                />
              ) : null,
          }}
        </ProFeatures>
        <ProDocs />
        <ProPlans
          plans={plans.value}
          loading={isLoading.value}
          selectedPeriod={state.selectedPeriod}
          availablePeriods={availablePeriods.value}
          radioValue={state.radioValue}
          activePlanId={activeSubscription.value?.planId || null}
          packPlan={packPlan.value}
          blackFriday={campaigns.value.blackFriday}
          onSubscribe={onSubscribe}
          onBuyPack={onBuyPack}
          onPeriod={onPeriod}
        />
        <ProTrust />
        <ProFaq onFaqOpen={onFaqOpen} />
      </div>
    )
  },
})
