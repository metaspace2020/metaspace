import { computed, defineComponent, reactive } from '@vue/composition-api'
import {
  checkIfHasBrowserFiles,
  DatasetDetailItem,
  deleteDatasetQuery,
  reprocessDatasetQuery,
} from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import { Dropdown, DropdownItem, DropdownMenu, Button } from '../../../lib/element-ui'
import reportError from '../../../lib/reportError'
import DownloadDialog from '../list/DownloadDialog'
import { DatasetComparisonDialog } from '../comparison/DatasetComparisonDialog'
import config from '../../../lib/config'
import NewFeatureBadge, { hideFeatureBadge } from '../../../components/NewFeatureBadge'
import { useQuery } from '@vue/apollo-composable'
import './DatasetActionsDropdown.scss'
import { checkIfEnrichmentRequested } from '../../../api/enrichmentdb'

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

interface DatasetActionsDropdownState{
  disabled: boolean
  showMetadataDialog: boolean
  showCompareDialog: boolean
  showEnrichmentDialog: boolean
  showDownloadDialog: boolean
}

export const DatasetActionsDropdown = defineComponent<DatasetActionsDropdownProps>({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit' },
    compareActionLabel: { type: String, default: 'Compare with other datasets...' },
    browserActionLabel: { type: String, default: 'Imzml Browser' },
    enrichmentActionLabel: { type: String, default: 'LION enrichment' },
    reprocessActionLabel: { type: String, default: 'Reprocess data' },
    downloadActionLabel: { type: String, default: 'Download' },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    currentUser: { type: Object as () => CurrentUserRoleResult },
  },
  setup(props, ctx) {
    const { emit, root } = ctx
    const { $router, $confirm, $apollo, $notify } = root
    const state = reactive<DatasetActionsDropdownState>({
      disabled: false,
      showMetadataDialog: false,
      showCompareDialog: false,
      showEnrichmentDialog: false,
      showDownloadDialog: false,
    })

    const {
      result: enrichmentResult,
      refetch: enrichmentRefetch,
    } = useQuery<any>(checkIfEnrichmentRequested, { id: props.dataset?.id },
      { fetchPolicy: 'no-cache' })
    const enrichmentRequested = computed(() => enrichmentResult.value != null
      ? enrichmentResult.value.enrichmentRequested : null)

    const confirmReprocessEnrichment = async() => {
      try {
        await $confirm('The changes to the analysis options require the dataset to be reprocessed. '
          + 'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
        'Reprocessing required',
        {
          type: 'warning',
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
        })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const {
      result: browserResult,
      refetch: browserRefetch,
    } = useQuery<any>(checkIfHasBrowserFiles, { datasetId: props.dataset?.id },
      { fetchPolicy: 'no-cache' as const })
    const hasBrowserFiles = computed(() => browserResult.value != null
      ? browserResult.value.hasImzmlFiles : null)

    const openDeleteDialog = async() => {
      const force = props.dataset?.status === 'QUEUED' || props.dataset?.status === 'ANNOTATING'
      try {
        let msg = `Are you sure you want to ${force ? 'FORCE-DELETE' : 'delete'} ${props.dataset.name}?`
        if (props.dataset.status !== 'FINISHED' && props.dataset.status !== 'FAILED') {
          msg += '\nAs this dataset is currently processing, you may receive an annotation failure email - this can be '
            + 'safely ignored.'
        }

        await $confirm(msg, {
          type: force ? 'warning' : undefined,
          lockScroll: false,
        })
      } catch (cancel) {
        return
      }

      try {
        state.disabled = true
        await $apollo.mutate({
          mutation: deleteDatasetQuery,
          variables: {
            id: props.dataset?.id,
            force,
          },
        })

        emit('datasetMutated')
        $notify.success(`Dataset deleted ${props.dataset?.name}`)
        $router.replace('/datasets')
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

    const handleEnrichmentRequest = async() => {
      if (await confirmReprocessEnrichment()) {
        handleReprocess(true)
      }
    }

    const handleReprocess = async(performEnrichment = false) => {
      try {
        state.disabled = true
        await $apollo.mutate({
          mutation: reprocessDatasetQuery,
          variables: {
            id: props.dataset?.id,
            useLithops: config.features.lithops,
            performEnrichment: performEnrichment,
          },
        })
        $notify.success('Dataset sent for reprocessing')
        emit('datasetMutated')
      } catch (err) {
        reportError(err)
      } finally {
        state.disabled = false
      }
    }

    const confirmReprocess = async() => {
      try {
        await $confirm('The changes to the analysis options require the dataset to be reprocessed. '
          + 'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
        'Reprocessing required',
        {
          type: 'warning',
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
        })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const handleCommand = async(command: string) => {
      switch (command) {
        case 'edit':
          $router.push({
            name: 'edit-metadata',
            params: { dataset_id: props.dataset?.id },
          })
          break
        case 'enrichment':
          await enrichmentRefetch()
          if (enrichmentRequested.value) {
            $router.push({
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
            $router.push({
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
          openDownloadDialog()
          break
        case 'reprocess':
          handleReprocess()
          break
        default:
          // pass
          break
      }
    }

    return () => {
      const {
        actionLabel, currentUser, dataset, editActionLabel, deleteActionLabel,
        downloadActionLabel, reprocessActionLabel, compareActionLabel,
        enrichmentActionLabel, browserActionLabel,
      } = props
      const { role } = currentUser || {}
      const { canEdit, canDelete, canDownload, id, name } = dataset || {}
      const canReprocess = (role === 'admin') || (dataset?.status === 'FAILED' && canEdit)

      return (
        <Dropdown
          class='dataset-actions-dropdown'
          style={{
            visibility: (!canEdit && !canDelete && !canReprocess && !canDownload) ? 'hidden' : '',
          }} trigger='click' type="primary" onCommand={handleCommand}>
          <NewFeatureBadge featureKey="dataset-overview-actions">
            <Button class="p-1" type="primary" onClick={() => {
              hideFeatureBadge('dataset-overview-actions')
            }}>
              <span class="ml-2">{actionLabel}</span><i class="el-icon-arrow-down el-icon--right"/>
            </Button>
          </NewFeatureBadge>
          <DropdownMenu class='dataset-overview-menu p-2'>
            {
              canDownload
              && <DropdownItem command="download">{downloadActionLabel}</DropdownItem>
            }
            <DropdownItem command="compare">{compareActionLabel}</DropdownItem>
            {
              config.features.imzml_browser
              && <DropdownItem command="browser" class='relative'>
                <NewFeatureBadge featureKey="imzmlBrowser" class='actionBadge'>
                  {browserActionLabel}
                </NewFeatureBadge>
              </DropdownItem>
            }
            {
              config.features.enrichment
              && (enrichmentRequested.value || canEdit)
              && <DropdownItem command="enrichment">{enrichmentActionLabel}</DropdownItem>
            }
            {
              canEdit
              && <DropdownItem command="edit">{editActionLabel}</DropdownItem>
            }
            {
              canDelete
              && <DropdownItem class='text-red-500' command="delete">{deleteActionLabel}</DropdownItem>
            }
            {
              canReprocess
              && <DropdownItem class='text-red-500' command="reprocess">{reprocessActionLabel}</DropdownItem>
            }
          </DropdownMenu>
          {
            state.showDownloadDialog
            && <DownloadDialog
              datasetId={id}
              datasetName={name}
              onClose={closeDownloadDialog}
            />
          }
          {
            state.showCompareDialog
            && <DatasetComparisonDialog
              selectedDatasetIds={[id]}
              onClose={closeCompareDialog}
            />
          }
        </Dropdown>
      )
    }
  },
})
