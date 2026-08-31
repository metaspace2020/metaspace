import { computed, ComputedRef } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElNotification } from '../../../lib/element-plus'
import { userProfileQuery } from '../../../api/user'

/**
 * Tell a user without edit rights on the project why they cannot create an experiment.
 * Experiments are no longer Pro-gated: free users get a limited number of uses,
 * enforced server-side (the mutation fails with a "limit reached" error once exhausted).
 */
export function promptExperimentAccessDenied(): void {
  ElNotification.warning({
    title: '',
    message: 'You need to be a member or manager of this project to create an experiment.',
  })
}

/**
 * Shared gate for the "Create experiment" action.
 *
 * A user may create an experiment when they are a system admin, OR when they
 * can edit the project (project member/manager). Usage limits for free users
 * are enforced server-side via the plan module (canPerformAction/performAction);
 * beta testers with the 'experiments' feature are exempt from those limits.
 * Both `ExperimentsList` (the button) and `ExperimentEditPage` (the create
 * page/action) rely on this so the rule stays in one place.
 */
export function useExperimentPermissions() {
  const { result: currentUserResult } = useQuery<any>(userProfileQuery, null, {
    fetchPolicy: 'cache-first',
  })

  const isAdmin = computed<boolean>(() => currentUserResult.value?.currentUser?.role === 'admin')
  const currentUserId = computed<string | null>(() => currentUserResult.value?.currentUser?.id ?? null)

  /** canEdit || isAdmin — pass the project's canEdit flag. */
  const canCreateExperiment = (canEdit: ComputedRef<boolean> | (() => boolean)): ComputedRef<boolean> =>
    computed<boolean>(() => {
      const editable = typeof canEdit === 'function' ? canEdit() : canEdit.value
      return isAdmin.value || editable
    })

  return { isAdmin, currentUserId, canCreateExperiment }
}
