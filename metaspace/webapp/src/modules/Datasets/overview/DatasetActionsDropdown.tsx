import { computed, defineComponent, inject, reactive } from 'vue'
import {
  checkIfHasBrowserFiles,
  DatasetDetailItem,
  deleteDatasetQuery,
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
import config from '../../../lib/config'
import NewFeatureBadge, { hideFeatureBadge } from '../../../components/NewFeatureBadge'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import './DatasetActionsDropdown.scss'
import { checkIfEnrichmentRequested } from '../../../api/enrichmentdb'
import { ArrowDown } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { verifyRecaptcha } from '../../../api/auth'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  deleteActionLabel: string
  reprocessActionLabel: string
  downloadActionLabel: string
  compareActionLabel: string
  browserActionLabel: string
  enrichmentActionLabel: string
  dataset: DatasetDetailItem
  currentUser: CurrentUserRoleResult
}

interface DatasetActionsDropdownState {
  disabled: boolean
  showMetadataDialog: boolean
  showCompareDialog: boolean
  showEnrichmentDialog: boolean
  showDownloadDialog: boolean
}

export const DatasetActionsDropdown = defineComponent({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit' },
    compareActionLabel: { type: String, default: 'Compare with other datasets...' },
    browserActionLabel: { type: String, default: 'Imzml Browser' },
    enrichmentActionLabel: { type: String, default: 'Ontology enrichment' },
    reprocessActionLabel: { type: String, default: 'Reprocess data' },
    downloadActionLabel: { type: String, default: 'Download' },
    recaptchaToken: { type: String, default: '' },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    currentUser: { type: Object as () => CurrentUserRoleResult },
  },
  setup(props: DatasetActionsDropdownProps, ctx) {
    const { emit } = ctx
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive<DatasetActionsDropdownState>({
      disabled: false,
      showMetadataDialog: false,
      showCompareDialog: false,
      showEnrichmentDialog: false,
      showDownloadDialog: false,
    })

    const { result: enrichmentResult, refetch: enrichmentRefetch } = useQuery<any>(
      checkIfEnrichmentRequested,
      { id: props.dataset?.id },
      { fetchPolicy: 'no-cache' }
    )
    const enrichmentRequested = computed(() =>
      enrichmentResult.value != null ? enrichmentResult.value.enrichmentRequested : null
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
        reportError(err, 'Deletion failed :( Please contact us at contact@metaspace2020.eu')
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
        case 'download':
          if (!props.currentUser?.id || (await confirmDownload())) {
            const verified = await verifyRecaptcha(props.recaptchaToken)
            if (verified) {
              openDownloadDialog()
            } else {
              ElNotification.warning('Problem validating identity. Please try again later.')
            }
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
      } = props
      const { role } = currentUser || {}
      const { canEdit, canDelete, canDownload } = dataset || {}
      const canReprocess = role === 'admin' || (dataset?.status === 'FAILED' && canEdit)

      return (
        <ElDropdownMenu class="dataset-overview-menu p-2">
          {(!currentUser?.id || canDownload) && (
            <ElDropdownItem command="download">{downloadActionLabel}</ElDropdownItem>
          )}
          <ElDropdownItem command="compare">{compareActionLabel}</ElDropdownItem>
          {config.features.imzml_browser && (
            <ElDropdownItem command="browser">
              <div class="relative actionBadge">
                <NewFeatureBadge featureKey="imzmlBrowser">{browserActionLabel}</NewFeatureBadge>
              </div>
            </ElDropdownItem>
          )}
          {config.features.enrichment && (enrichmentRequested.value || canEdit) && (
            <ElDropdownItem command="enrichment">{enrichmentActionLabel}</ElDropdownItem>
          )}
          {canEdit && <ElDropdownItem command="edit">{editActionLabel}</ElDropdownItem>}
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
                    isLogged={currentUser !== null}
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
