import { computed, defineComponent, reactive } from '@vue/composition-api'
import { DatasetDetailItem, deleteDatasetQuery } from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import { Dropdown, DropdownItem, DropdownMenu, Button } from 'element-ui'
import reportError from '../../../lib/reportError'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  deleteActionLabel: string
  dataset: DatasetDetailItem
  metadata: any
  currentUser: CurrentUserRoleResult
}

export const DatasetActionsDropdown = defineComponent<DatasetActionsDropdownProps>({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    deleteActionLabel: { type: String, default: 'Delete' },
    editActionLabel: { type: String, default: 'Edit' },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    metadata: { type: Object as () => any, required: true },
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
        && props.currentUser.role === 'admin'
        && props.dataset.status !== 'FINISHED'
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
            id: props.dataset.id,
            force,
          },
        })

        emit('datasetMutated')
        $notify.success(`Dataset deleted ${props?.dataset?.name}`)
        $router.replace('/datasets')
      } catch (err) {
        state.disabled = false
        reportError(err, 'Deletion failed :( Please contact us at contact@metaspace2020.eu')
      }
    }

    const handleCommand = (command: string) => {
      console.log('handleCommand', command)

      switch (command) {
        case 'edit':
          $router.push({
            name: 'edit-metadata',
            params: { dataset_id: props?.dataset?.id },
          })
          break
        case 'delete':
          openDeleteDialog()
          break
        default:
          // pass
          break
      }
    }

    return () => {
      const { actionLabel, currentUser, dataset, editActionLabel, deleteActionLabel } = props
      const { role, id: currentUserId } = currentUser || {}
      const { submitter, status } = dataset || {}
      const publicationStatus = computed(() => {
        if (dataset?.projects.some(({ publicationStatus }) => publicationStatus === 'PUBLISHED')) {
          return 'Published'
        }
        if (dataset?.projects.some(({ publicationStatus }) => publicationStatus === 'UNDER_REVIEW')) {
          return 'Under review'
        }
        return null
      })
      const canEdit = (role === 'admin' || (currentUserId === submitter?.id
        && (status !== 'QUEUED' && status !== 'ANNOTATING')))
      const canDelete = (role === 'admin' || (canEdit && publicationStatus.value === null))

      return (
        <Dropdown trigger='click' type="primary" onCommand={handleCommand}>
          <Button class="p-1" type="primary">
            <span class="ml-2">{actionLabel}</span><i class="el-icon-arrow-down el-icon--right"/>
          </Button>
          <DropdownMenu>
            { canEdit && <DropdownItem command="edit">{editActionLabel}</DropdownItem> }
            { canDelete && <DropdownItem command="delete">{deleteActionLabel}</DropdownItem> }
          </DropdownMenu>
        </Dropdown>
      )
    }
  },
})
