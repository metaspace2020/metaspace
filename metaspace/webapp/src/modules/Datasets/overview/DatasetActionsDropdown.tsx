import { computed, defineComponent, inject, reactive } from 'vue'
import {
  checkIfHasBrowserFiles,
  DatasetDetailItem,
  deleteDatasetQuery,
  getSegmentationJobsQuery,
  reprocessDatasetQuery,
} from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import {
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElButton,
  ElNotification,
  ElMessageBox,
  ElIcon,
} from '../../../lib/element-plus'
import reportError from '../../../lib/reportError'
import DownloadDialog from '../list/DownloadDialog'
import { DatasetComparisonDialog } from '../comparison/DatasetComparisonDialog'
import { SegmentationDialog } from '../segmentation/SegmentationDialog'
import config from '../../../lib/config'
import NewFeatureBadge, { hideFeatureBadge } from '../../../components/NewFeatureBadge'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import './DatasetActionsDropdown.scss'
import { checkIfEnrichmentRequested } from '../../../api/enrichmentdb'
import { ArrowDown } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
// import { verifyRecaptcha } from '../../../api/auth'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  deleteActionLabel: string
  reprocessActionLabel: string
  downloadActionLabel: string
  compareActionLabel: string
  browserActionLabel: string
  enrichmentActionLabel: string
  opticalImageActionLabel: string
  segmentationActionLabel: string
  dataset: DatasetDetailItem
  currentUser: CurrentUserRoleResult
  isPublishedOrUnderReview: boolean
  isPro: boolean
}

interface DatasetActionsDropdownState {
  disabled: boolean
  showMetadataDialog: boolean
  showCompareDialog: boolean
  showEnrichmentDialog: boolean
  showDownloadDialog: boolean
  showSegmentationDialog: boolean
}

export const DatasetActionsDropdown = defineComponent({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit' },
    compareActionLabel: { type: String, default: 'Compare with other datasets...' },
    browserActionLabel: { type: String, default: 'Imzml browser' },
    segmentationActionLabel: { type: String, default: 'Image segmentation' },
    enrichmentActionLabel: { type: String, default: 'Ontology enrichment' },
    opticalImageActionLabel: { type: String, default: 'Add optical image' },
    reprocessActionLabel: { type: String, default: 'Reprocess data' },
    downloadActionLabel: { type: String, default: 'Download' },
    recaptchaToken: { type: String, default: () => '' },
    isPublishedOrUnderReview: { type: Boolean, default: () => false },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    currentUser: { type: Object as () => CurrentUserRoleResult },
    isPro: { type: Boolean, default: () => false },
  },
  setup(props: DatasetActionsDropdownProps, ctx) {
    const { emit } = ctx
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)
    // const token = computed(() => props.recaptchaToken)

    const state = reactive<DatasetActionsDropdownState>({
      disabled: false,
      showMetadataDialog: false,
      showCompareDialog: false,
      showEnrichmentDialog: false,
      showDownloadDialog: false,
      showSegmentationDialog: false,
    })

    const { result: enrichmentResult, refetch: enrichmentRefetch } = useQuery<any>(
      checkIfEnrichmentRequested,
      { id: props.dataset?.id },
      { fetchPolicy: 'no-cache' }
    )
    const enrichmentRequested = computed(() =>
      enrichmentResult.value != null ? enrichmentResult.value.enrichmentRequested : null
    )

    const { result: segmentationJobsResult, refetch: segmentationJobsRefetch } = useQuery<any>(
      getSegmentationJobsQuery,
      { datasetId: props.dataset?.id },
      { fetchPolicy: 'no-cache' }
    )
    const segmentationJobs = computed(() =>
      segmentationJobsResult.value != null ? segmentationJobsResult.value.segmentationJobs : null
    )

    const confirmReprocessEnrichment = async () => {
      try {
        await ElMessageBox.confirm(
          'To perform the ontology enrichment, please select the desired enrichment ontology ' +
            'on the dataset edition page.',
          'Enrichment not found',
          {
            type: 'warning',
            confirmButtonText: 'Edit dataset',
            cancelButtonText: 'Cancel',
          }
        )
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const { result: browserResult, refetch: browserRefetch } = useQuery<any>(
      checkIfHasBrowserFiles,
      { datasetId: props.dataset?.id },
      { fetchPolicy: 'no-cache' as const }
    )
    const hasBrowserFiles = computed(() => (browserResult.value != null ? browserResult.value.hasImzmlFiles : null))

    const openDeleteDialog = async () => {
      const force = props.dataset?.status === 'QUEUED' || props.dataset?.status === 'ANNOTATING'
      try {
        let msg = `Are you sure you want to ${force ? 'FORCE-DELETE' : 'delete'} ${props.dataset.name}?`
        if (props.dataset.status !== 'FINISHED' && props.dataset.status !== 'FAILED') {
          msg +=
            '\nAs this dataset is currently processing, you may receive an annotation failure email - this can be ' +
            'safely ignored.'
        }

        await ElMessageBox.confirm(msg, {
          type: force ? 'warning' : undefined,
          lockScroll: false,
        })
      } catch (cancel) {
        return
      }

      try {
        state.disabled = true
        await apolloClient.mutate({
          mutation: deleteDatasetQuery,
          variables: {
            id: props.dataset?.id,
            force,
          },
        })

        emit('datasetMutated')
        ElNotification.success(`Dataset deleted ${props.dataset?.name}`)
        router.replace('/datasets')
      } catch (err) {
        state.disabled = false
        reportError(err, 'Deletion failed :( Please contact us at contact@metaspace2020.org')
      }
    }

    const openDownloadDialog = () => {
      state.showDownloadDialog = true
    }

    const closeDownloadDialog = () => {
      state.showDownloadDialog = false
    }

    const openCompareDialog = () => {
      state.showCompareDialog = true
    }

    const closeCompareDialog = () => {
      state.showCompareDialog = false
    }

    const openSegmentationDialog = async () => {
      const hasSegementation = segmentationJobs.value.find((job: any) => job.status === 'FINISHED')
      const jobRunning = segmentationJobs.value.find((job: any) => job.status === 'STARTED')

      if (jobRunning) {
        await ElNotification.warning(
          'A segmentation job is already running for this dataset. Please wait for it to complete.'
        )
        return
      } else if (hasSegementation) {
        await ElMessageBox.confirm(
          'Segmentation has already been performed for this dataset. Do you want to continue?',
          {
            lockScroll: false,
            type: 'warning',
            confirmButtonText: 'Go to segmentation',
            cancelButtonText: 'Change  parameters',
          }
        )
          .then(() => {
            router.push({
              name: 'dataset-segmentation',
              params: { dataset_id: props.dataset?.id },
            })
          })
          .catch(() => {
            state.showSegmentationDialog = true
          })
      } else {
        state.showSegmentationDialog = true
      }
    }

    const closeSegmentationDialog = () => {
      state.showSegmentationDialog = false
    }

    const handleEnrichmentRequest = async () => {
      if (await confirmReprocessEnrichment()) {
        router.push({
          name: 'edit-metadata',
          params: { dataset_id: props.dataset?.id },
          query: { feat: 'enrichment' },
        })
      }
    }

    const handleReprocess = async (performEnrichment = false) => {
      try {
        state.disabled = true
        await apolloClient.mutate({
          mutation: reprocessDatasetQuery,
          variables: {
            id: props.dataset?.id,
            useLithops: config.features.lithops,
            performEnrichment: performEnrichment,
          },
        })
        ElNotification.success('Dataset sent for reprocessing')
        emit('datasetMutated')
      } catch (err) {
        reportError(err)
      } finally {
        state.disabled = false
      }
    }

    const confirmReprocess = async () => {
      try {
        await ElMessageBox.confirm(
          'The changes to the analysis options require the dataset to be reprocessed. ' +
            'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
          'Reprocessing required',
          {
            type: 'warning',
            confirmButtonText: 'Continue',
            cancelButtonText: 'Cancel',
          }
        )
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const confirmDownload = async () => {
      try {
        await ElMessageBox.confirm(
          'Proceeding will reduce your daily download limit by one. Do you want to continue?',
          'Please Note the download Limit',
          {
            type: 'warning',
            confirmButtonText: 'Continue',
            cancelButtonText: 'Cancel',
          }
        )
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const handleCommand = async (command: string) => {
      switch (command) {
        case 'edit':
          router.push({
            name: 'edit-metadata',
            params: { dataset_id: props.dataset?.id },
          })
          break
        case 'optical-image':
          router.push({
            name: 'add-optical-image',
            params: { dataset_id: props.dataset?.id },
          })
          break
        case 'enrichment':
          await enrichmentRefetch()
          if (enrichmentRequested.value) {
            router.push({
              name: 'dataset-enrichment',
              params: { dataset_id: props.dataset?.id },
              query: { db_id: props.dataset?.databases[0]?.id?.toString() },
            })
          } else {
            handleEnrichmentRequest()
          }
          break
        case 'browser':
          await browserRefetch()
          hideFeatureBadge('imzmlBrowser')
          if (hasBrowserFiles.value) {
            router.push({
              name: 'dataset-browser',
              params: { dataset_id: props.dataset?.id },
            })
          } else if (await confirmReprocess()) {
            handleReprocess()
          }
          break
        case 'delete':
          openDeleteDialog()
          break
        case 'compare':
          openCompareDialog()
          break
        case 'segmentation':
          await segmentationJobsRefetch()
          hideFeatureBadge('imageSegmentation')
          if (props.isPro || props.currentUser?.role === 'admin') {
            openSegmentationDialog()
          } else {
            ElNotification.warning({
              title: '',
              message: `
                You need to be a METASPACE Pro user to perform image
                 segmentation. Check 
                 <a href="/plans" target="_blank" rel="noopener">our plans</a> and get an upgrade.
              `,
              dangerouslyUseHTMLString: true,
            })
          }
          break
        case 'download':
          if (!props.currentUser?.id || (await confirmDownload())) {
            // const verified = await verifyRecaptcha(token.value)
            // if (verified) {
            openDownloadDialog()
            // } else {
            //   ElNotification.warning('Problem validating identity. Please try again later.')
            // }
          }
          break
        case 'reprocess':
          handleReprocess()
          break
        default:
          // pass
          break
      }
    }

    const renderDropdown = () => {
      const {
        currentUser,
        dataset,
        editActionLabel,
        deleteActionLabel,
        downloadActionLabel,
        reprocessActionLabel,
        compareActionLabel,
        enrichmentActionLabel,
        browserActionLabel,
        opticalImageActionLabel,
        segmentationActionLabel,
      } = props
      const { role } = currentUser || {}
      const { canEdit, canDelete, canDownload } = dataset || {}
      const canReprocess = role === 'admin' || (dataset?.status === 'FAILED' && canEdit)

      return (
        <ElDropdownMenu class="dataset-overview-menu p-2">
          {canEdit && <ElDropdownItem command="optical-image">{opticalImageActionLabel}</ElDropdownItem>}
          <ElDropdownItem command="compare">{compareActionLabel}</ElDropdownItem>
          {(!currentUser?.id || canDownload) && (
            <ElDropdownItem command="download">{downloadActionLabel}</ElDropdownItem>
          )}
          {canEdit && <ElDropdownItem command="edit">{editActionLabel}</ElDropdownItem>}
          {config.features.imzml_browser && (
            <ElDropdownItem command="browser">
              <div class="relative actionBadge">
                <NewFeatureBadge featureKey="imzmlBrowser">{browserActionLabel}</NewFeatureBadge>
              </div>
            </ElDropdownItem>
          )}
          {canEdit && config.features.segmentation && (
            <ElDropdownItem command="segmentation">
              <div class="relative actionBadge">
                <NewFeatureBadge featureKey="imageSegmentation">{segmentationActionLabel}</NewFeatureBadge>
              </div>
            </ElDropdownItem>
          )}
          {config.features.enrichment && (enrichmentRequested.value || canEdit) && (
            <ElDropdownItem command="enrichment">{enrichmentActionLabel}</ElDropdownItem>
          )}
          {canDelete && (
            <ElDropdownItem class="text-red-500" command="delete">
              {deleteActionLabel}
            </ElDropdownItem>
          )}
          {canReprocess && (
            <ElDropdownItem class="text-red-500" command="reprocess">
              {reprocessActionLabel}
            </ElDropdownItem>
          )}
        </ElDropdownMenu>
      )
    }

    return () => {
      const { actionLabel, currentUser, dataset } = props
      const { id, name } = dataset || {}

      return (
        <ElDropdown
          class="dataset-actions-dropdown"
          trigger={state.showDownloadDialog ? '' : 'click'}
          type="primary"
          onCommand={handleCommand}
          v-slots={{
            default: () => (
              <div class="ml-2">
                <NewFeatureBadge featureKey="dataset-overview-actions">
                  <ElButton
                    class="p-1"
                    type="primary"
                    onClick={() => {
                      hideFeatureBadge('dataset-overview-actions')
                    }}
                  >
                    <span class="ml-2 mr-2">{actionLabel}</span>
                    <ElIcon class="select-btn-icon">
                      <ArrowDown />
                    </ElIcon>
                  </ElButton>
                </NewFeatureBadge>
                {state.showDownloadDialog && (
                  <DownloadDialog
                    datasetId={id}
                    datasetName={name}
                    onClose={closeDownloadDialog}
                    isPublishedOrUnderReview={props.isPublishedOrUnderReview}
                    isLogged={currentUser !== null}
                  />
                )}
                {state.showSegmentationDialog && (
                  <SegmentationDialog
                    datasetId={id}
                    datasetName={name}
                    databases={props.dataset?.databases}
                    config={JSON.parse(props.dataset?.configJson || '{}')}
                    onClose={closeSegmentationDialog}
                  />
                )}
                {state.showCompareDialog && (
                  <DatasetComparisonDialog selectedDatasetIds={[id]} onClose={closeCompareDialog} />
                )}
              </div>
            ),
            dropdown: renderDropdown,
          }}
        />
      )
    }
  },
})
