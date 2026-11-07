import { defineComponent, computed, inject, ref, watch } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import type { ApolloClient } from '@apollo/client/core'
import { ElButton, ElNotification, ElOption, ElSelect } from '../../lib/element-plus'
import reportError from '../../lib/reportError'
import {
  currentUserProGroupQuery,
  PROJECT_ENTITLEMENT_LABELS,
  PROJECT_ENTITLEMENT_ORDER,
  ProjectEntitlement,
  ProjectSponsorship,
  projectSponsorshipQuery,
  removeProjectSponsorshipMutation,
  setProjectSponsorshipMutation,
} from '../../api/projectSponsorship'

interface ProjectSponsorshipQueryResult {
  projectSponsorship: ProjectSponsorship | null
}

interface CurrentUserProGroupQueryResult {
  currentUserProGroup: { id: string; name: string } | null
}

/** Value of the synthetic "Select all" / "Deselect all" option; never kept in the selection. */
const SELECT_ALL_VALUE = '__all__'

/** Order-insensitive equality of two entitlement sets. */
const sameEntitlements = (a: ProjectEntitlement[], b: ProjectEntitlement[]): boolean => {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, i) => value === sortedB[i])
}

/**
 * "Pro settings" section of the project settings page. Lets a member of a Pro group sponsor
 * selected Pro features for the project's non-Pro members, or (when the current user has no
 * Pro group) remove an existing sponsorship.
 */
export default defineComponent({
  name: 'ProjectProSettings',
  props: {
    projectId: { type: String, required: true },
    currentUserId: { type: String, default: null },
  },
  setup(props) {
    const apolloClient = inject(DefaultApolloClient) as ApolloClient<unknown>

    const {
      result: sponsorshipResult,
      loading: sponsorshipLoading,
      refetch: refetchSponsorship,
    } = useQuery<ProjectSponsorshipQueryResult>(projectSponsorshipQuery, () => ({ projectId: props.projectId }), {
      fetchPolicy: 'network-only',
    })
    const { result: proGroupResult, loading: proGroupLoading } = useQuery<CurrentUserProGroupQueryResult>(
      currentUserProGroupQuery,
      null,
      { fetchPolicy: 'cache-first' }
    )

    const sponsorship = computed<ProjectSponsorship | null>(() => sponsorshipResult.value?.projectSponsorship ?? null)
    const proGroup = computed(() => proGroupResult.value?.currentUserProGroup ?? null)
    const storedEntitlements = computed<ProjectEntitlement[]>(() => sponsorship.value?.entitlements ?? [])

    const selected = ref<ProjectEntitlement[]>([])
    const saving = ref(false)

    watch(
      storedEntitlements,
      (entitlements) => {
        selected.value = [...entitlements]
      },
      { immediate: true }
    )

    const isUnchanged = computed(() => sameEntitlements(selected.value, storedEntitlements.value))
    const allSelected = computed(() => PROJECT_ENTITLEMENT_ORDER.every((k) => selected.value.includes(k)))

    /**
     * Applies the select's new value. Picking the "Select all" entry selects every feature, or clears
     * the selection when every feature is already selected; the entry itself is never stored.
     */
    const onSelectionChange = (value: string[]): void => {
      if (value.includes(SELECT_ALL_VALUE)) {
        selected.value = allSelected.value ? [] : [...PROJECT_ENTITLEMENT_ORDER]
        return
      }
      selected.value = PROJECT_ENTITLEMENT_ORDER.filter((k) => value.includes(k))
    }

    const runMutation = async (mutate: () => Promise<unknown>, successMessage: string): Promise<void> => {
      saving.value = true
      try {
        await mutate()
        ElNotification.success({ title: '', message: successMessage })
        await refetchSponsorship()
      } catch (err) {
        reportError(err)
      } finally {
        saving.value = false
      }
    }

    const removeSponsorship = (): Promise<unknown> =>
      apolloClient.mutate({
        mutation: removeProjectSponsorshipMutation,
        variables: { projectId: props.projectId },
      })

    const onSave = (): Promise<void> =>
      runMutation(
        () =>
          selected.value.length === 0
            ? removeSponsorship()
            : apolloClient.mutate({
                mutation: setProjectSponsorshipMutation,
                variables: {
                  projectId: props.projectId,
                  entitlements: PROJECT_ENTITLEMENT_ORDER.filter((k) => selected.value.includes(k)),
                },
              }),
        'Pro settings saved'
      )

    const onRemove = (): Promise<void> => runMutation(removeSponsorship, 'Pro sponsorship removed')

    return () => {
      // Hide only until the first result of each query; keep the section mounted during refetches.
      if ((sponsorshipLoading.value && !sponsorshipResult.value) || (proGroupLoading.value && !proGroupResult.value)) {
        return null
      }
      if (proGroup.value === null && sponsorship.value === null) return null

      const groupName = proGroup.value?.name ?? sponsorship.value?.proGroup?.name
      const sponsoredByOther =
        props.currentUserId != null &&
        sponsorship.value !== null &&
        sponsorship.value.sponsorUserId !== props.currentUserId

      return (
        <div class="mt-12" data-test-key="project-pro-settings">
          <h2 class="text-2xl leading-8 py-2 m-0">Pro settings</h2>
          <p>
            Members of this project who are not Pro can use the selected features on this project's datasets. Usage
            counts against <b>{groupName}</b>'s plan.
          </p>
          {sponsoredByOther && (
            <p>
              Currently sponsored by <b>{sponsorship.value?.proGroup?.name}</b>.
            </p>
          )}
          {proGroup.value !== null ? (
            <div>
              <ElSelect
                class="w-full"
                data-test-key="entitlement-select"
                modelValue={selected.value}
                multiple
                clearable
                placeholder="Select Pro features to share"
                disabled={saving.value}
                onUpdate:modelValue={onSelectionChange}
              >
                <ElOption
                  key={SELECT_ALL_VALUE}
                  value={SELECT_ALL_VALUE}
                  label={allSelected.value ? 'Deselect all' : 'Select all'}
                  data-test-key="entitlement-select-all"
                />
                {PROJECT_ENTITLEMENT_ORDER.map((key) => (
                  <ElOption
                    key={key}
                    value={key}
                    label={PROJECT_ENTITLEMENT_LABELS[key]}
                    data-test-key={`entitlement-${key}`}
                  />
                ))}
              </ElSelect>
              <div class="mt-4">
                <ElButton
                  type="primary"
                  data-test-key="save-pro-settings"
                  disabled={isUnchanged.value || saving.value}
                  loading={saving.value}
                  onClick={onSave}
                >
                  Save
                </ElButton>
              </div>
            </div>
          ) : (
            <ElButton
              type="danger"
              data-test-key="remove-pro-settings"
              disabled={saving.value}
              loading={saving.value}
              onClick={onRemove}
            >
              Remove sponsorship
            </ElButton>
          )}
        </div>
      )
    }
  },
})
