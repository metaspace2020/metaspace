import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { proFeatureWhitelistQuery } from '../api/plan'
import { getActiveUserSubscriptionQuery } from '../api/subscription'
import { currentUserRoleQuery } from '../api/user'

export type ProFeature = 'diffAnalysis' | 'segmentation'

/**
 * Single source of truth for METASPACE Pro feature gating.
 *
 * A feature is available if the user is an admin, has an active Pro subscription,
 * or is hand-listed for that feature in the graphql plan module's whitelist.
 */
export function useProFeatures() {
  const { result: whitelistResult, loading: whitelistLoading } = useQuery<any>(proFeatureWhitelistQuery, null, {
    fetchPolicy: 'cache-first',
  })
  const { result: subscriptionResult, loading: subscriptionLoading } = useQuery<any>(
    getActiveUserSubscriptionQuery,
    null,
    { fetchPolicy: 'cache-and-network' }
  )
  const { result: userResult, loading: userLoading } = useQuery<any>(currentUserRoleQuery, null, {
    fetchPolicy: 'cache-first',
  })

  const isAdmin = computed(() => userResult.value?.currentUser?.role === 'admin')
  const isPro = computed(() => !!subscriptionResult.value?.activeUserSubscription?.isActive)
  const whitelist = computed<ProFeature[]>(() => whitelistResult.value?.proFeatureWhitelist ?? [])
  const loading = computed(() => whitelistLoading.value || subscriptionLoading.value || userLoading.value)

  const canUse = (feature: ProFeature): boolean => isAdmin.value || isPro.value || whitelist.value.includes(feature)

  return { canUse, isPro, isAdmin, whitelist, loading }
}
