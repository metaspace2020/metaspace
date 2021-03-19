import { computed, defineComponent } from '@vue/composition-api'
import { DatasetDetailItem } from '../../../api/dataset'
import { CurrentUserRoleResult } from '../../../api/user'
import { Dropdown, DropdownItem, DropdownMenu, Button } from 'element-ui'

interface DatasetActionsDropdownProps {
  actionLabel: string
  editActionLabel: string
  dataset: DatasetDetailItem
  metadata: any
  currentUser: CurrentUserRoleResult
}

export const DatasetActionsDropdown = defineComponent<DatasetActionsDropdownProps>({
  name: 'DatasetActionsDropdown',
  props: {
    actionLabel: { type: String, default: 'Actions' },
    editActionLabel: { type: String, default: 'Edit' },
    dataset: { type: Object as () => DatasetDetailItem, required: true },
    metadata: { type: Object as () => any, required: true },
    currentUser: { type: Object as () => CurrentUserRoleResult },
  },
  setup(props, ctx) {
    const { $router } = ctx.root

    const handleCommand = (command: string) => {
      console.log('handleCommand', command)
      if (command === 'edit') {
        $router.push({
          name: 'edit-metadata',
          params: { dataset_id: props?.dataset?.id },
        })
      }
    }

    return () => {
      const { actionLabel, currentUser, dataset, editActionLabel } = props
      const { role, id: currentUserId } = currentUser || {}
      const { submitter, status } = dataset || {}
      const canEdit = (role === 'admin' || (currentUserId === submitter?.id
        && (status !== 'QUEUED' && status !== 'ANNOTATING')))

      return (
        <Dropdown trigger='click' type="primary" onCommand={handleCommand}>
          <Button class="p-1" type="primary">
            <span class="ml-2">{actionLabel}</span><i class="el-icon-arrow-down el-icon--right"/>
          </Button>
          <DropdownMenu>
            { canEdit && <DropdownItem command="edit">{editActionLabel}</DropdownItem> }
          </DropdownMenu>
        </Dropdown>
      )
    }
  },
})
