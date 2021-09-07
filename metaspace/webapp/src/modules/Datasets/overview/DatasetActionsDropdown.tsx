import { computed, defineComponent, reactive } from '@vue/composition-api'
import { DatasetDetailItem, deleteDatasetQuery, reprocessDatasetQuery } from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import { Dropdown, DropdownItem, DropdownMenu, Button } from '../../../lib/element-ui'
import reportError from '../../../lib/reportError'
import DownloadDialog from '../list/DownloadDialog'
import { DatasetComparisonDialog } from '../comparison/DatasetComparisonDialog'
import config from '../../../lib/config'
import NewFeatureBadge, { hideFeatureBadge } from '../../../components/NewFeatureBadge'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  deleteActionLabel: string
  reprocessActionLabel: string
  downloadActionLabel: string
  compareActionLabel: string
  dataset: DatasetDetailItem
  currentUser: CurrentUserRoleResult
}

interface DatasetActionsDropdownState{
  disabled: boolean
  showMetadataDialog: boolean
  showCompareDialog: boolean
  showDownloadDialog: boolean
}

export const DatasetActionsDropdown = defineComponent<DatasetActionsDropdownProps>({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit metadata' },
    compareActionLabel: { type: String, default: 'Compare with other datasets...' },
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
      showDownloadDialog: false,
    })

    const openDeleteDialog = async() => {
      const force = props.currentUser != null
        && props.currentUser?.role === 'admin'
        && props.dataset?.status !== 'FINISHED'
      try {
        const msg = `Are you sure you want to ${force ? 'FORCE-DELETE' : 'delete'} ${props.dataset.name}?`
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

    const handleReprocess = async() => {
      try {
        state.disabled = true
        await $apollo.mutate({
          mutation: reprocessDatasetQuery,
          variables: {
            id: props.dataset?.id,
            useLithops: config.features.lithops,
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

    const handleCommand = (command: string) => {
      switch (command) {
        case 'edit':
          $router.push({
            name: 'edit-metadata',
            params: { dataset_id: props.dataset?.id },
          })
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
      } = props
      const { role } = currentUser || {}
      const { canEdit, canDelete, canDownload, id, name } = dataset || {}
      const canReprocess = (role === 'admin')

      return (
        <Dropdown style={{
          visibility: (!canEdit && !canDelete && !canReprocess && !canDownload) ? 'hidden' : '',
        }} trigger='click' type="primary" onCommand={handleCommand}>
          <NewFeatureBadge featureKey="dataset-overview-actionsx">
            <Button class="p-1" type="primary" onClick={() => {
              hideFeatureBadge('dataset-overview-actions')
            }}>
              <span class="ml-2">{actionLabel}</span><i class="el-icon-arrow-down el-icon--right"/>
            </Button>
          </NewFeatureBadge>
          <DropdownMenu class='dataset-overview-menu p-2'>
            {
              canEdit
              && <DropdownItem command="edit">{editActionLabel}</DropdownItem>
            }
            {
              canDownload
              && <DropdownItem command="download">{downloadActionLabel}</DropdownItem>
            }
            <DropdownItem command="compare">{compareActionLabel}</DropdownItem>
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
