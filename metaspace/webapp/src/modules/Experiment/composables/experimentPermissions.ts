import { computed, ComputedRef } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElNotification } from '../../../lib/element-plus'
import { getActiveUserSubscriptionQuery } from '../../../api/subscription'
import { userProfileQuery } from '../../../api/user'

/**
 * Prompt a project editor who lacks Pro to upgrade, with a link to the plans page.
 * Matches the pattern used for other Pro-gated actions (e.g. image segmentation).
 */
export function promptExperimentProUpgrade(): void {
  ElNotification.warning({
    title: '',
    message: `
      You need to be a METASPACE Pro user to create an experiment. Check
      <a href="/plans" target="_blank" rel="noopener">our plans</a> and get an upgrade.
    `,
    dangerouslyUseHTMLString: true,
  })
}

/**
 * Shared gate for the "Create experiment" action.
 *
 * A user may create an experiment when they are a system admin, OR when they
 * can edit the project (project manager) AND have an active Pro subscription.
 * Both `ExperimentsList` (the button) and `ExperimentEditPage` (the create
 * page/action) rely on this so the rule stays in one place.
 */
export function useExperimentPermissions() {
  const { result: subscriptionResult, loading: subscriptionLoading } = useQuery<any>(
    getActiveUserSubscriptionQuery,
    null,
    { fetchPolicy: 'network-only' }
  )
  const { result: currentUserResult } = useQuery<any>(userProfileQuery, null, {
    fetchPolicy: 'cache-first',
  })

  const isPro = computed<boolean>(() => !!subscriptionResult.value?.activeUserSubscription?.isActive)
  const isAdmin = computed<boolean>(() => currentUserResult.value?.currentUser?.role === 'admin')
  const currentUserId = computed<string | null>(() => currentUserResult.value?.currentUser?.id ?? null)

  /** (canEdit && isPro) || isAdmin — pass the project's canEdit flag. */
  const canCreateExperiment = (canEdit: ComputedRef<boolean> | (() => boolean)): ComputedRef<boolean> =>
    computed<boolean>(() => {
      const editable = typeof canEdit === 'function' ? canEdit() : canEdit.value
      return isAdmin.value || (editable && isPro.value)
    })

  return { isPro, isAdmin, currentUserId, subscriptionLoading, canCreateExperiment }
}
