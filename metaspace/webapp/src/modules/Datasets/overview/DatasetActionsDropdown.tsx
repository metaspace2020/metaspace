import { computed, defineComponent, reactive } from '@vue/composition-api'
import { DatasetDetailItem, deleteDatasetQuery, reprocessDatasetQuery } from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import { Dropdown, DropdownItem, DropdownMenu, Button } from '../../../lib/element-ui'
import reportError from '../../../lib/reportError'
import DownloadDialog from '../list/DownloadDialog'
import config from '../../../lib/config'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  deleteActionLabel: string
  reprocessActionLabel: string
  downloadActionLabel: string
  dataset: DatasetDetailItem
  currentUser: CurrentUserRoleResult
}

export const DatasetActionsDropdown = defineComponent<DatasetActionsDropdownProps>({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit metadata' },
    reprocessActionLabel: { type: String, default: 'Reprocess data' },
    downloadActionLabel: { type: String, default: 'Download' },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    currentUser: { type: Object as () => CurrentUserRoleResult },
  },
  setup(props, ctx) {
    const { emit, root } = ctx
    const { $router, $confirm, $apollo, $notify } = root
    const state = reactive({
      disabled: false,
      showMetadataDialog: false,
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
      console.log('handleCommand', command)

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
        downloadActionLabel, reprocessActionLabel,
      } = props
      const { role, id: currentUserId } = currentUser || {}
      const { submitter, status, canDownload, id, name } = dataset || {}
      const publicationStatus = computed(() => {
        if (dataset?.projects?.some(({ publicationStatus }) => publicationStatus === 'PUBLISHED')) {
          return 'Published'
        }
        if (dataset?.projects?.some(({ publicationStatus }) => publicationStatus === 'UNDER_REVIEW')) {
          return 'Under review'
        }
        return null
      })
      const canEdit = (role === 'admin' || (currentUserId === submitter?.id
        && (status !== 'QUEUED' && status !== 'ANNOTATING')))
      const canDelete = (role === 'admin' || (canEdit && publicationStatus.value === null))
      const canReprocess = (role === 'admin')

      return (
        <Dropdown style={{
          visibility: (!canEdit && !canDelete && !canReprocess && !canDownload) ? 'hidden' : '',
        }} trigger='click' type="primary" onCommand={handleCommand}>
          <Button class="p-1" type="primary">
            <span class="ml-2">{actionLabel}</span><i class="el-icon-arrow-down el-icon--right"/>
          </Button>
          <DropdownMenu class='dataset-overview-menu'>
            {
              canEdit
              && <DropdownItem command="edit">{editActionLabel}</DropdownItem>
            }
            {
              canDownload
              && <DropdownItem command="download">{downloadActionLabel}</DropdownItem>
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
        </Dropdown>
      )
    }
  },
})
