import { computed, defineComponent, reactive, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { FilterPanel } from '../../Filters/index'

import {
  ElIcon,
  ElButton,
  ElAlert,
  ElCollapse,
  ElCollapseItem,
  ElTag,
  ElSelect,
  ElOption,
  ElPopover,
  ElMessageBox,
  ElNotification,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElDivider,
} from '../../../lib/element-plus'
import reportError from '../../../lib/reportError'
import { Loading, ArrowLeft, ArrowDown, QuestionFilled, InfoFilled } from '@element-plus/icons-vue'
import { format as formatDate } from 'date-fns'
import './SegmentationPage.scss'
import {
  getDatasetByIdQuery,
  segmentationJobQuery,
  getSegmentationJobsQuery,
  deleteSegmentationJobMutation,
  getSegmentationsQuery,
  opticalImagesQuery,
  getSegmentationIonProfilesWithImagesQuery,
} from '@/api/dataset'
import { SegmentationVisualization } from './SegmentationVisualization'
import { SegmentationHeatmap } from './SegmentationHeatmap'
import { SegmentMarkers } from './SegmentMarkers'
import { SegmentationDiagnostics } from './SegmentationDiagnostics'
import { SegmentationTable } from './SegmentationTable'
import AspectRatioIcon from '../../../assets/inline/material/aspect-ratio.svg'
import { MonitorSvg } from '@/design/refactoringUIIcons'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { Setting } from '@element-plus/icons-vue'

import OpticalImage from '../../../assets/microscope-icon.png'

/** The caller's visible segmentation job, as returned by `segmentationJobQuery`. */
interface SegmentationJob {
  id: number
  datasetId: string
  status: string
  error: string | null
  userId: string | null
  isDefault: boolean
  isMine: boolean
  resultData: string | null
  labelMapUrl: string | null
  updatedAt: string | null
}

interface SegmentationJobQueryResult {
  segmentationJob: SegmentationJob | null
}

/** A row of `getSegmentationJobsQuery`: the default runs plus the caller's own runs, newest first. */
interface SegmentationJobListItem {
  id: number
  status: string
  isDefault: boolean
  isMine: boolean
}

interface SegmentationJobsQueryResult {
  segmentationJobs: SegmentationJobListItem[]
}

/** One of the (at most two) finished runs a viewer can switch between. */
interface SegmentationRun {
  id: number
  isDefault: boolean
}

/** The fields of a job's `resultData` the header reads. */
interface SegmentationResultSummary {
  algorithm?: string
  n_segments?: number
  parameters_used?: Record<string, unknown>
}

/** One label/value row of the info popover. */
interface InfoRow {
  label: string
  value: string
}

const SUBMITTER_RUN_LABEL = 'Submitter segmentation'
const PRIVATE_RUN_LABEL = 'My segmentation'

/**
 * Names a run the way the page header does.
 *
 * @param run - The run, default (submitter's) or private
 * @returns `Submitter segmentation` for the default run, `My segmentation` otherwise
 */
const runLabel = (run: { isDefault: boolean }): string => (run.isDefault ? SUBMITTER_RUN_LABEL : PRIVATE_RUN_LABEL)

/**
 * Formats a job timestamp as a date. graphql serialises job dates as epoch milliseconds; ISO strings work too.
 *
 * @param value - Timestamp from the job
 * @returns `yyyy-MM-dd`, or null when the value is missing or unparseable
 */
const formatJobDate = (value: string | null): string | null => {
  if (!value) return null
  const date = new Date(/^\d+$/.test(value) ? Number(value) : value)
  return Number.isNaN(date.getTime()) ? null : formatDate(date, 'yyyy-MM-dd')
}

/**
 * Lists the scalar entries of `parameters_used` as popover rows, skipping empty values and lists such as `k_range`.
 *
 * @param parameters - The `parameters_used` object of a job result
 * @returns One row per non-null scalar parameter
 */
const parameterRows = (parameters: Record<string, unknown> | undefined): InfoRow[] =>
  Object.entries(parameters ?? {})
    .filter(([, value]) => value != null && typeof value !== 'object')
    .map(([label, value]) => ({ label, value: String(value) }))

/** The diagnostic-shaped object `SegmentationVisualization` reads its label map from. */
interface SegmentationDiagnosticData {
  id: string
  type: 'SEGMENTATION'
  updatedDT: string | null
  data: string
  images: { key: string; index: number | null; url: string; format: string }[]
}

export default defineComponent({
  name: 'DatasetSegmentationPage',
  components: {
    FilterPanel,
    ElIcon,
    ElButton,
    ElAlert,
    ElCollapse,
    ElCollapseItem,
    ElTag,
    ElSelect,
    ElOption,
    Loading,
    SegmentationVisualization,
    SegmentationHeatmap,
    SegmentMarkers,
    SegmentationDiagnostics,
    SegmentationTable,
  },
  props: {
    className: {
      type: String,
      default: 'segmentation-page',
    },
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive({
      activeCollapseItems: ['segmentation-map'],
      showLegend: true,
      resetViewTrigger: 0,
      showSegmentMarkers: false,
      showOpticalImage: true,
      selectedSegmentMarkersSegmentationId: null as string | null,
      annotations: [] as any[],
      isLoading: false,
    })

    const datasetId = computed(() => route.params.dataset_id)
    // The run picked in the header switcher; null lets the server choose (own private run, else the submitter's)
    const selectedJobId = ref<number | null>(null)
    // Bumped whenever the shown run changes, so an in-flight profile load of the previous run is discarded
    let profileLoadToken = 0
    // The two run queries always go to the server: a cached result for the same variables can belong to a run
    // that was deleted since, and would otherwise feed its segments to the profile loader before the refetch lands
    const runQueryOptions = { fetchPolicy: 'network-only' } as const

    const { result: datasetResult } = useQuery<any>(getDatasetByIdQuery, {
      id: datasetId.value,
    })
    const currentDataset = computed(() => datasetResult.value?.dataset)

    const {
      result: segmentationsResult,
      loading: segmentationsLoading,
      onResult: handleSegmentationsLoad,
      refetch: refetchSegmentations,
    } = useQuery<any>(
      getSegmentationsQuery,
      () => ({
        datasetId: datasetId.value,
        jobId: selectedJobId.value,
      }),
      runQueryOptions
    )
    const segmentations = computed(() => segmentationsResult.value?.segmentations)

    handleSegmentationsLoad(async (result) => {
      if (result.data?.segmentations?.length > 0 && !state.selectedSegmentMarkersSegmentationId) {
        state.isLoading = true
        const token = profileLoadToken
        try {
          state.selectedSegmentMarkersSegmentationId = result.data?.segmentations?.[0]?.id
          const aggAnnotations = []
          for (const segmentation of result.data.segmentations) {
            const profilesResult = await apolloClient.query({
              query: getSegmentationIonProfilesWithImagesQuery,
              variables: {
                segmentationId: segmentation.id,
              },
            })
            const annotations = profilesResult.data?.segmentationIonProfiles.map((p: any) => {
              return {
                ...p.annotation,
                enrichmentScore: p.enrichScore,
                segmentationId: segmentation.id,
                segmentIndex: segmentation.segmentIndex,
              }
            })
            aggAnnotations.push(...annotations)
          }
          if (token !== profileLoadToken) return
          state.annotations = aggAnnotations
        } catch (error) {
          // pass
        }
        if (token !== profileLoadToken) return
        state.isLoading = false
      }
    })

    const {
      result: segmentationJobResult,
      loading,
      error,
      refetch: refetchSegmentationJob,
    } = useQuery<SegmentationJobQueryResult>(
      segmentationJobQuery,
      () => ({
        datasetId: datasetId.value,
        jobId: selectedJobId.value,
      }),
      runQueryOptions
    )
    const segmentationJob = computed(() => segmentationJobResult.value?.segmentationJob ?? null)

    const { result: segmentationJobsResult, refetch: refetchSegmentationJobs } = useQuery<SegmentationJobsQueryResult>(
      getSegmentationJobsQuery,
      () => ({ datasetId: datasetId.value })
    )

    // The viewer's latest finished private run first, then the latest finished submitter run
    const availableRuns = computed<SegmentationRun[]>(() => {
      const finished = (segmentationJobsResult.value?.segmentationJobs ?? []).filter((j) => j.status === 'FINISHED')
      const own = finished.find((j) => !j.isDefault && j.isMine)
      const submitter = finished.find((j) => j.isDefault)
      return [own, submitter]
        .filter((j): j is SegmentationJobListItem => j != null)
        .map((j) => ({ id: j.id, isDefault: j.isDefault }))
    })

    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: datasetId.value,
    })

    // Rebuilt from the job in the shape of the old SEGMENTATION diagnostic, so
    // SegmentationVisualization keeps reading the LABEL_MAP image the same way.
    const diagnosticData = computed<SegmentationDiagnosticData | null>(() => {
      const job = segmentationJob.value
      if (!job || job.resultData == null) return null
      return {
        id: String(job.id),
        type: 'SEGMENTATION',
        updatedDT: job.updatedAt,
        data: job.resultData,
        images: job.labelMapUrl ? [{ key: 'LABEL_MAP', index: null, url: job.labelMapUrl, format: 'NPY' }] : [],
      }
    })

    const opticalImage = computed(() => {
      return (opticalImagesResult.value as any)?.dataset?.opticalImages?.[0]
    })

    const segmentationData = computed(() => {
      if (!diagnosticData.value) return null
      try {
        return JSON.parse(diagnosticData.value.data)
      } catch (error) {
        console.error('Failed to parse segmentation data:', error)
        return null
      }
    })

    const resultSummary = computed<SegmentationResultSummary>(() => segmentationData.value ?? {})
    const clusterCount = computed<number>(
      () => resultSummary.value.n_segments ?? (segmentations.value as unknown[] | undefined)?.length ?? 0
    )

    // Owners delete their private run; dataset editors (incl. admins) delete the submitter run
    const canDeleteJob = computed<boolean>(() => {
      const job = segmentationJob.value
      if (!job) return false
      return job.isDefault ? currentDataset.value?.canEdit === true : job.isMine
    })

    // const { result } = useQuery(getSegmentationIonProfilesWithImagesQuery, queryVariables, {
    //   skip: computed(() => !segmentations.value),
    // })

    // // Transform segmentation ion profiles into annotation format
    // const annotations = computed(() => {
    //   if (!result.value || !(result.value as any).segmentationIonProfiles) return []

    //   return (result.value as any).segmentationIonProfiles
    //     .filter((profile: any) => profile.annotation?.isotopeImages?.length > 0)
    //     .sort((a: any, b: any) => b.enrichScore - a.enrichScore)
    //     .map((profile: any) => ({
    //       ...profile.annotation,
    //       enrichmentScore: profile.enrichScore,
    //     }))
    // })

    const goBack = () => {
      router.push(`/dataset/${datasetId.value}`)
    }

    const deleting = ref(false)

    /** Drops the shown run's cluster profiles so `handleSegmentationsLoad` reloads them for the next run. */
    const resetProfiles = () => {
      profileLoadToken++
      state.selectedSegmentMarkersSegmentationId = null
      state.annotations = []
      state.isLoading = false
    }
    // A new run is about to load: discard the previous run's profiles and any load still in flight
    watch(selectedJobId, resetProfiles, { flush: 'sync' })

    /**
     * Loads the run picked in the header switcher (clusters, map, markers, table and diagnostics).
     *
     * @param jobId - Id of the picked run
     */
    const handleSwitchRun = (jobId: number) => {
      if (jobId === segmentationJob.value?.id) return
      selectedJobId.value = jobId
    }

    /**
     * Builds the confirm message for deleting the shown run. Only fixed copy and a number are interpolated.
     *
     * @param job - The run on screen
     * @returns HTML message with the run name in bold
     */
    const deleteConfirmMessage = (job: SegmentationJob): string => {
      const clusters = `Its ${clusterCount.value} clusters, markers and diagnostics will be removed`
      if (job.isDefault) {
        return `Delete <b>${SUBMITTER_RUN_LABEL}</b>? ${clusters} for everyone who can see this dataset.`
      }
      const fallback = availableRuns.value.some((run) => run.isDefault)
        ? 'The submitter segmentation will be shown instead.'
        : 'No segmentation will be shown for this dataset.'
      return `Delete <b>${PRIVATE_RUN_LABEL}</b>? ${clusters}. ${fallback}`
    }

    /**
     * Deletes the run on screen after confirmation, then reloads the run list and shows the remaining run
     * (the server's default choice) or the empty state.
     */
    const handleDeleteSegmentation = async () => {
      const job = segmentationJob.value
      if (!job || deleting.value) return
      try {
        await ElMessageBox.confirm(deleteConfirmMessage(job), 'Delete segmentation', {
          type: 'warning',
          confirmButtonText: 'Delete',
          cancelButtonText: 'Keep it',
          confirmButtonClass: 'el-button--danger',
          dangerouslyUseHTMLString: true,
        })
      } catch (cancel) {
        return
      }
      deleting.value = true
      try {
        await apolloClient.mutate({ mutation: deleteSegmentationJobMutation, variables: { id: job.id } })
        ElNotification.success('Segmentation deleted')
        resetProfiles()
        const refetches: Promise<unknown>[] = [refetchSegmentationJobs() ?? Promise.resolve()]
        if (selectedJobId.value != null) {
          // Changing the variables already refetches the job and its segments (network-only)
          selectedJobId.value = null
        } else {
          refetches.push(refetchSegmentationJob() ?? Promise.resolve(), refetchSegmentations() ?? Promise.resolve())
        }
        await Promise.all(refetches)
      } catch (err) {
        reportError(err)
      } finally {
        deleting.value = false
      }
    }

    /** Rows of the info popover: clusters, creation, method and the scalar parameters of the run. */
    const infoRows = computed<InfoRow[]>(() => {
      const job = segmentationJob.value
      if (!job) return []
      const created = formatJobDate(job.updatedAt)
      // Never an email: the viewer's own run, else the dataset submitter by name
      const creator = job.isMine ? 'you' : currentDataset.value?.submitter?.name || 'the submitter'
      const rows: InfoRow[] = [{ label: 'Clusters', value: String(clusterCount.value) }]
      if (created) {
        rows.push({ label: 'Created', value: `${created} by ${creator}` })
      }
      if (resultSummary.value.algorithm) {
        rows.push({ label: 'Method', value: resultSummary.value.algorithm })
      }
      return [...rows, ...parameterRows(resultSummary.value.parameters_used)]
    })

    const renderRunTitle = (job: SegmentationJob) => {
      const title = <span class="segmentation-title text-base font-medium text-gray-900">{runLabel(job)}</span>
      if (availableRuns.value.length < 2) return title
      return (
        <ElDropdown
          class="segmentation-switcher"
          trigger="click"
          onCommand={handleSwitchRun}
          v-slots={{
            default: () => (
              <span class="flex items-center gap-1 cursor-pointer">
                {title}
                <ElIcon>
                  <ArrowDown />
                </ElIcon>
              </span>
            ),
            dropdown: () => (
              <ElDropdownMenu>
                {availableRuns.value.map((run) => (
                  <ElDropdownItem key={run.id} command={run.id} class={run.id === job.id ? 'font-semibold' : undefined}>
                    {runLabel(run)}
                  </ElDropdownItem>
                ))}
              </ElDropdownMenu>
            ),
          }}
        />
      )
    }

    const renderRunInfo = (job: SegmentationJob) => (
      <ElPopover
        trigger="hover"
        placement="bottom"
        v-slots={{
          reference: () => (
            <ElIcon class="segmentation-info-icon text-gray-500 cursor-pointer" aria-label="About this segmentation">
              <InfoFilled />
            </ElIcon>
          ),
          default: () => (
            <div class="segmentation-info text-sm w-72">
              {infoRows.value.map((row) => (
                <div key={row.label} data-row={row.label} class="flex justify-between gap-4 py-0.5">
                  <span class="text-gray-600">{row.label}</span>
                  <span class="text-gray-900 text-right break-words">{row.value}</span>
                </div>
              ))}
              <ElDivider class="!my-2" />
              <p class="text-gray-600 break-normal">
                {job.isDefault
                  ? 'Shown to everyone who opens this dataset and has access to it. ' +
                    'Only dataset editors can replace or delete it.'
                  : 'Only you can see this segmentation.'}
              </p>
            </div>
          ),
        }}
      />
    )

    /** Gear menu at the right end of the "Segmentation map" bar, before the ion-image controls icon. */
    const renderRunSettings = () => {
      if (!canDeleteJob.value) return null
      return (
        <ElDropdown
          class="segmentation-settings"
          trigger="click"
          onCommand={(command: string) => {
            if (command === 'delete') handleDeleteSegmentation()
          }}
          v-slots={{
            default: () => (
              <ElButton
                link
                title="Segmentation settings"
                aria-label="Segmentation settings"
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                <ElIcon class="text-2xl text-gray-900">
                  <Setting />
                </ElIcon>
              </ElButton>
            ),
            dropdown: () => (
              <ElDropdownMenu>
                <ElDropdownItem command="delete" class="segmentation-delete text-red-500" disabled={deleting.value}>
                  Delete segmentation…
                </ElDropdownItem>
              </ElDropdownMenu>
            ),
          }}
        />
      )
    }

    /** Right side of the header: run title (switcher with two runs), badge, info popover and gear menu. */
    const renderRunHeader = () => {
      const job = segmentationJob.value
      if (!job) return null
      return (
        <div class="segmentation-run-header flex items-center gap-2">
          {renderRunTitle(job)}
          {renderRunInfo(job)}
        </div>
      )
    }

    const handleCollapseChange = (activeNames: string[]) => {
      state.activeCollapseItems = activeNames
      setTimeout(() => {
        state.showSegmentMarkers = activeNames.includes('segment-markers')
      }, 100)
    }

    const handleIonSelected = (ion: string) => {
      console.log('Ion selected:', ion)
    }

    const handleResetView = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.resetViewTrigger++
    }

    const handleToggleLegend = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.showLegend = !state.showLegend
    }

    const handleToggleOpticalImage = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.showOpticalImage = !state.showOpticalImage
    }

    const getSegmentDisplayName = (segmentation: any) => {
      return (segmentation.name && segmentation.name.trim()) || `Cluster ${segmentation.segmentIndex + 1}`
    }

    const renderHelpIcon = (text: string) => (
      <ElPopover
        trigger="hover"
        placement="top"
        width={260}
        v-slots={{
          reference: () => (
            <ElIcon class="metadata-help-icon ml-1" onClick={(e: MouseEvent) => e.stopPropagation()}>
              <QuestionFilled />
            </ElIcon>
          ),
          default: () => <span class="text-sm">{text}</span>,
        }}
      />
    )

    const renderTableWrapper = () => {
      if (!segmentationData.value) return null

      return (
        <div class="segmentation-table-wrapper w-full md:w-6/12">
          <SegmentationTable
            annotations={state.annotations}
            segmentations={segmentations.value || []}
            isLoading={state.isLoading}
            onRowChange={() => {}}
          />
        </div>
      )
    }

    const renderSegmentationMapSection = () => {
      if (!diagnosticData.value) return null

      return (
        <ElCollapseItem
          name="segmentation-map"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header">
                <div class="collapse-left">
                  <span class="collapse-title">Segmentation map</span>
                  <ElButton size="small" link={true} onClick={handleResetView} class="action-button" title="Reset view">
                    <AspectRatioIcon class="w-6 h-6 fill-current text-gray-900" />
                  </ElButton>
                  {opticalImage.value && (
                    <ElButton
                      title="Toggle optical image"
                      link={true}
                      class={`${
                        state.showOpticalImage ? 'active' : ''
                      } button-reset flex h-6 channel-toggle !ml-0 !p-0`}
                      onClick={handleToggleOpticalImage}
                    >
                      <img
                        src={OpticalImage}
                        class="w-6 h-6 pointer-events-none"
                        style={{
                          filter: state.showOpticalImage ? '' : 'opacity(60%)',
                        }}
                      />
                    </ElButton>
                  )}
                </div>
                <div class="collapse-actions">
                  {renderRunSettings()}
                  <ElButton
                    title="Ion image controls"
                    link={true}
                    class={`${state.showLegend ? 'active' : ''} button-reset flex h-6  channel-toggle !ml-0 !p-0`}
                    onClick={handleToggleLegend}
                  >
                    <StatefulIcon class="h-6 w-6 pointer-events-none" active={state.showLegend}>
                      <MonitorSvg class="fill-blue-700" />
                    </StatefulIcon>
                  </ElButton>
                </div>
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            <SegmentationVisualization
              diagnosticData={diagnosticData.value}
              showLegend={state.showLegend}
              resetViewTrigger={state.resetViewTrigger}
              opticalImage={opticalImage.value}
              showOpticalImage={state.showOpticalImage}
              segmentations={segmentations.value || []}
            />
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentationHeaptmap = () => {
      if (!segmentationData.value) return null

      return (
        <ElCollapseItem
          name="segmentation-heatmap"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header !justify-start">
                <span class="collapse-title">Segmentation heatmap</span>
                {renderHelpIcon(
                  'Top 3 annotations per cluster, ranked by AUC score and scaled within each cluster using ' +
                    'min-max normalization.'
                )}
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            <SegmentationHeatmap
              segmentationData={segmentationData.value}
              annotations={state.annotations}
              isLoading={loading.value || state.isLoading}
              isVisible={true}
              segmentations={segmentations.value || []}
              onIonSelected={handleIonSelected}
            />
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentMarkersSection = () => {
      if (!segmentationData.value) return null

      return (
        <ElCollapseItem
          name="segment-markers"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header !justify-start">
                <span class="collapse-title">Segment markers</span>
                <ElPopover
                  trigger="click"
                  placement="bottom"
                  v-slots={{
                    reference: () => (
                      <div class="flex ml-1" onClick={(e) => e.stopPropagation()}>
                        <ElIcon class="text-xl pointer-events-none">
                          <Setting class="" />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="collapse-actions flex flex-col">
                        <span>Select cluster:</span>
                        <ElSelect
                          modelValue={state.selectedSegmentMarkersSegmentationId}
                          placeholder="Cluster segment"
                          size="small"
                          class="segment-markers-cluster-select my-2"
                          style={{ width: '220px' }}
                          onChange={(id: string) => {
                            state.selectedSegmentMarkersSegmentationId = id
                          }}
                        >
                          {segmentations.value?.map((s: any) => (
                            <ElOption key={s.id} label={getSegmentDisplayName(s)} value={s.id} />
                          ))}
                        </ElSelect>
                      </div>
                    ),
                  }}
                />
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            {state.showSegmentMarkers &&
              (segmentationsLoading.value && segmentations.value.length === 0 ? (
                <div class="segment-markers-loading flex items-center justify-center gap-2 p-6 text-gray-600">
                  <ElIcon class="loading-icon">
                    <Loading />
                  </ElIcon>
                  <span>Loading segmentations…</span>
                </div>
              ) : state.selectedSegmentMarkersSegmentationId ? (
                <SegmentMarkers
                  key={state.selectedSegmentMarkersSegmentationId}
                  segmentationId={state.selectedSegmentMarkersSegmentationId}
                  annotations={state.annotations.filter(
                    (ann: any) => ann.segmentationId === state.selectedSegmentMarkersSegmentationId
                  )}
                  segmentations={segmentations.value || []}
                />
              ) : (
                <p class="empty-message p-4 text-center text-gray-600">
                  No cluster segmentations available for markers.
                </p>
              ))}
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentationDiagnosticsSection = () => {
      if (!segmentationData.value) return null

      return (
        <ElCollapseItem
          name="diagnostics"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header !justify-start">
                <span class="collapse-title">Segmentation diagnostics</span>
                {renderHelpIcon(
                  'How confidently each pixel was assigned to a cluster by the GMM model. The dashed line marks ' +
                    'the most common confidence bin (peak).'
                )}
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            <SegmentationDiagnostics segmentationData={segmentationData.value} isLoading={loading.value} />
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentationInfoWrapper = () => {
      if (!segmentationData.value) {
        return <div class="segmentation-info-wrapper w-full md:w-6/12" />
      }

      const activeNames = [...state.activeCollapseItems]

      return (
        <div class="segmentation-info-wrapper w-full md:w-6/12">
          <ElCollapse modelValue={[...activeNames]} class="segmentation-info-collapse" onChange={handleCollapseChange}>
            {renderSegmentationMapSection()}
            {renderSegmentationHeaptmap()}
            {renderSegmentMarkersSection()}
            {renderSegmentationDiagnosticsSection()}
          </ElCollapse>
        </div>
      )
    }

    return () => {
      if (loading.value) {
        return (
          <div class="segmentation-page">
            <div class="loading-container">
              <ElIcon class="loading-icon">
                <Loading />
              </ElIcon>
              <p>Loading segmentation data...</p>
            </div>
          </div>
        )
      }

      if (error.value) {
        return (
          <div class="segmentation-page">
            <div class="error-container">
              <ElAlert
                title="Error loading segmentation data"
                type="error"
                description="Something went wrong while loading the segmentation results. Please try again later."
                show-icon
                closable={false}
              />
              <ElButton onClick={goBack} class="back-button">
                <ElIcon>
                  <ArrowLeft />
                </ElIcon>
                Go Back
              </ElButton>
            </div>
          </div>
        )
      }

      if (!diagnosticData.value) {
        return (
          <div class="segmentation-page">
            <div class="no-data-container">
              <ElAlert
                title="No segmentation data available"
                type="info"
                description="This dataset doesn't have any segmentation analysis results."
                show-icon
                closable={false}
              />
              <ElButton onClick={goBack} class="back-button">
                <ElIcon>
                  <ArrowLeft />
                </ElIcon>
                Go Back
              </ElButton>
            </div>
          </div>
        )
      }

      return (
        <div class="segmentation-page">
          <div class="page-header flex-row flex-wrap">
            {/* Mirrors the two columns below: back link over the table, run switcher centred over the map. */}
            <div class="flex w-full ml-1">
              <div
                onClick={goBack}
                class="flex items-center text-blue-600 hover:text-blue-800 underline cursor-pointer mt-2 mb-1"
              >
                <ElIcon>
                  <ArrowLeft />
                </ElIcon>
                Back to {currentDataset.value?.name} overview
              </div>
            </div>
            <div></div>
            <div class="w-full sm:w-1/2" />
            <div class="flex w-full sm:w-1/2  justify-center">{renderRunHeader()}</div>
          </div>

          <div class="flex w-full flex-wrap flex-row">
            {renderTableWrapper()}
            {renderSegmentationInfoWrapper()}
          </div>
        </div>
      )
    }
  },
})
