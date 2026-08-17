import { computed, defineComponent, inject, onMounted, reactive } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDialog,
  ElInput,
  ElNotification,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from '../../../lib/element-plus'
import { useRouter } from 'vue-router'

import { DatasetSplitPreview, datasetSplitPreviewQuery, splitDatasetByRoisMutation } from '../../../api/dataset'
import { getRemainingApiUsagesQuery } from '../../../api/plan'
import { currentUserRoleWithGroupQuery } from '../../../api/user'
import reportError from '../../../lib/reportError'
import config from '../../../lib/config'
import './SplitDialog.scss'

interface SplitDialogProps {
  datasetId: string
  datasetName: string
  visible: boolean
}

interface SplitDialogState {
  selectedRoiIds: string[]
  names: Record<string, string>
  projectMode: 'new' | 'existing'
  newProjectName: string | null
  projectId: string | null
  groupId: string | null
  isPublic: boolean | null
  loading: boolean
  error: string | null
}

export const SplitDialog = defineComponent({
  name: 'SplitDialog',
  props: {
    datasetId: { type: String, required: true },
    datasetName: { type: String, required: true },
    visible: { type: Boolean, default: false },
  },
  emits: ['close'],
  setup(props: SplitDialogProps, { emit }) {
    const apolloClient = inject(DefaultApolloClient)
    const router = useRouter()
    const state = reactive<SplitDialogState>({
      selectedRoiIds: [],
      names: {},
      projectMode: 'new',
      newProjectName: null,
      projectId: null,
      groupId: null,
      isPublic: null,
      loading: false,
      error: null,
    })

    const { result: previewResult, loading: previewLoading } = useQuery<{
      datasetSplitPreview: DatasetSplitPreview
    }>(datasetSplitPreviewQuery, () => ({ datasetId: props.datasetId }), { fetchPolicy: 'no-cache' })
    const preview = computed(() => previewResult.value?.datasetSplitPreview)

    const { result: userResult } = useQuery<any>(currentUserRoleWithGroupQuery)
    const groupOptions = computed(() => (userResult.value?.currentUser?.groups || []).map((ug: any) => ug.group))

    const { result: quotaResult } = useQuery<any>(getRemainingApiUsagesQuery, () => ({
      types: ['create'],
    }))
    // A split runs the full annotation pipeline once per ROI, so it consumes one dataset
    // creation per selected region.
    const remainingCreates = computed(() => {
      const usage = (quotaResult.value?.remainingApiUsages || []).find((item: any) => item.actionType === 'create')
      return usage?.remaining ?? null
    })

    const selectableRois = computed(() => (preview.value?.rois || []).filter((roi) => !roi.blocked))
    const blockedRois = computed(() => (preview.value?.rois || []).filter((roi) => roi.blocked))
    const overQuota = computed(
      () => remainingCreates.value != null && state.selectedRoiIds.length > remainingCreates.value
    )

    onMounted(() => {
      state.newProjectName = `${props.datasetName} — ROI split`
    })

    // Pre-select everything that can actually be split, and prefill each child's name.
    const syncDefaults = () => {
      if (state.selectedRoiIds.length === 0 && selectableRois.value.length > 0) {
        state.selectedRoiIds = selectableRois.value.map((roi) => roi.roiId)
        selectableRois.value.forEach((roi) => {
          if (state.names[roi.roiId] == null) {
            state.names[roi.roiId] = `${props.datasetName} — ${roi.name}`
          }
        })
      }
    }

    const toggleRoi = (roiId: string, checked: boolean) => {
      state.selectedRoiIds = checked
        ? [...state.selectedRoiIds, roiId]
        : state.selectedRoiIds.filter((id) => id !== roiId)
    }

    const handleSplit = async () => {
      state.error = null
      if (state.selectedRoiIds.length === 0) {
        state.error = 'Select at least one ROI to split along.'
        return
      }
      if (state.projectMode === 'existing' && !state.projectId) {
        state.error = 'Select the project the new datasets should go into.'
        return
      }

      state.loading = true
      try {
        const { data } = await apolloClient.mutate({
          mutation: splitDatasetByRoisMutation,
          variables: {
            input: {
              datasetId: props.datasetId,
              rois: state.selectedRoiIds.map((roiId) => ({ roiId, name: state.names[roiId] })),
              projectId: state.projectMode === 'existing' ? state.projectId : null,
              newProjectName: state.projectMode === 'new' ? state.newProjectName : null,
              groupId: state.groupId,
              isPublic: state.isPublic,
            },
            useLithops: config.features.lithops,
          },
        })

        const { projectId } = JSON.parse(data.splitDatasetByRois)
        ElNotification.success(
          `Splitting into ${state.selectedRoiIds.length} datasets. You will receive an email when ` +
            'they have all finished processing.'
        )
        emit('close')
        if (projectId) {
          router.push({ name: 'project', params: { projectIdOrSlug: projectId } })
        }
      } catch (err) {
        reportError(err)
      } finally {
        state.loading = false
      }
    }

    return () => {
      const data = preview.value
      if (data != null) {
        syncDefaults()
      }

      return (
        <ElDialog
          modelValue={props.visible}
          title="Split dataset by ROIs"
          lockScroll={false}
          class="split-dialog"
          onClose={() => emit('close')}
        >
          {previewLoading.value && <p>Loading regions…</p>}

          {data != null && !data.canSplit && (
            <ElAlert type="info" showIcon closable={false} title="This dataset cannot be split">
              {data.reason}
            </ElAlert>
          )}

          {data != null && data.canSplit && (
            <div class="split-dialog-body">
              <p class="split-intro">
                Each selected region becomes its own dataset, processed independently and collected in a project you
                own.
              </p>

              {data.previousSplitProjectId && (
                <ElAlert type="warning" showIcon closable={false} title="Already split">
                  You split this dataset on {new Date(data.previousSplitDate as string).toLocaleDateString()}. Splitting
                  again creates a new set of datasets.
                </ElAlert>
              )}

              <section class="split-section">
                <h4>Regions</h4>
                {selectableRois.value.map((roi) => (
                  <div class="split-roi-row" key={roi.roiId}>
                    <ElCheckbox
                      modelValue={state.selectedRoiIds.includes(roi.roiId)}
                      onChange={(checked: boolean) => toggleRoi(roi.roiId, checked)}
                      label={roi.name}
                    />
                    <span class={roi.warning ? 'split-roi-pixels is-warning' : 'split-roi-pixels'}>
                      {roi.nPixels.toLocaleString()} px
                      {roi.warning && ' — small, metrics and FDR may be unreliable'}
                    </span>
                    {state.selectedRoiIds.includes(roi.roiId) && (
                      <ElInput
                        class="split-roi-name"
                        modelValue={state.names[roi.roiId]}
                        onInput={(value: string) => {
                          state.names[roi.roiId] = value
                        }}
                      />
                    )}
                  </div>
                ))}

                {blockedRois.value.length > 0 && (
                  <ElAlert
                    type="info"
                    showIcon
                    closable={false}
                    class="mt-2"
                    title="Some regions are too small to split"
                  >
                    {blockedRois.value.map((roi) => `${roi.name} (${roi.nPixels} px)`).join(', ')}
                    {' — below 500 pixels there are too few spectra to produce usable annotations.'}
                  </ElAlert>
                )}
              </section>

              <section class="split-section">
                <h4>Destination</h4>
                <ElRadioGroup
                  modelValue={state.projectMode}
                  onChange={(value: 'new' | 'existing') => {
                    state.projectMode = value
                  }}
                >
                  <ElRadio label="new">New project</ElRadio>
                  <ElRadio label="existing">Existing project</ElRadio>
                </ElRadioGroup>

                {state.projectMode === 'new' ? (
                  <ElInput
                    class="split-project-input"
                    modelValue={state.newProjectName}
                    onInput={(value: string) => {
                      state.newProjectName = value
                    }}
                  />
                ) : (
                  <ElSelect
                    class="split-project-input"
                    modelValue={state.projectId}
                    placeholder="Select a project you manage"
                    onChange={(value: string) => {
                      state.projectId = value
                    }}
                  >
                    {(userResult.value?.currentUser?.projects || [])
                      .filter((up: any) => ['MEMBER', 'MANAGER'].includes(up.role))
                      .map((up: any) => (
                        <ElOption key={up.project.id} value={up.project.id} label={up.project.name} />
                      ))}
                  </ElSelect>
                )}

                {groupOptions.value.length > 0 && (
                  <ElSelect
                    class="split-project-input"
                    modelValue={state.groupId}
                    placeholder="Group (optional)"
                    clearable
                    onChange={(value: string) => {
                      state.groupId = value
                    }}
                  >
                    {groupOptions.value.map((group: any) => (
                      <ElOption key={group.id} value={group.id} label={group.name} />
                    ))}
                  </ElSelect>
                )}
              </section>

              <p class="split-note">
                The new datasets inherit this dataset's processing settings and are annotated from scratch. Because
                annotation metrics and FDR are estimated per dataset, results for a region will not be identical to the
                same region in the original.
              </p>

              {remainingCreates.value != null && (
                <p class={overQuota.value ? 'split-quota is-error' : 'split-quota'}>
                  This creates {state.selectedRoiIds.length} datasets. You have {remainingCreates.value} remaining in
                  your plan.
                </p>
              )}

              {state.error && <p class="split-quota is-error">{state.error}</p>}

              <div class="split-actions">
                <ElButton onClick={() => emit('close')}>Cancel</ElButton>
                <ElButton
                  type="primary"
                  loading={state.loading}
                  disabled={overQuota.value || state.selectedRoiIds.length === 0}
                  onClick={handleSplit}
                >
                  Split dataset
                </ElButton>
              </div>
            </div>
          )}
        </ElDialog>
      )
    }
  },
})

export default SplitDialog
