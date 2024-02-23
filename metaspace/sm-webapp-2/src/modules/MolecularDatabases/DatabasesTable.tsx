import { defineComponent, reactive, onBeforeMount, defineAsyncComponent } from 'vue'
import { useQuery } from '@vue/apollo-composable'

import UploadDialog from './UploadDialog'
import ElapsedTime from '../../components/ElapsedTime'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import SecondaryIcon from '../../components/SecondaryIcon.vue'

const CheckSvg = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-check.svg'))
const GroupSvg = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-user-group.svg'))

import { ElButton, ElLoading, ElTable, ElTableColumn } from '../../lib/element-plus'

import { getGroupDatabasesQuery } from '../../api/group'

const CheckColumn = defineComponent({
  name: 'CheckColumn',
  props: {
    prop: { type: String, required: true },
    label: String,
  },
  setup(props) {
    return () => (
      <ElTableColumn
        prop={props.prop}
        label={props.label}
        width={144}
        align="center"
        v-slots={{
          default: (scope: { row: any }) => (
            <span class="flex justify-center items-center h-5">
              {scope.row[props.prop] ? (
                <SecondaryIcon>
                  <CheckSvg />
                </SecondaryIcon>
              ) : null}
            </span>
          ),
        }}
      />
    )
  },
})

interface Props {
  handleRowClick: () => void
  groupId: string
}

const DatabasesTable = defineComponent({
  name: 'DatabasesTable',
  props: {
    handleRowClick: { type: Function, required: true },
    groupId: { type: String, required: true },
  },
  directives: {
    loading: ElLoading.directive,
  },
  setup(props: Props) {
    const state = reactive({
      showUploadDialog: false,
    })

    const { result, loading, refetch } = useQuery(
      getGroupDatabasesQuery,
      { groupId: props.groupId },
      { fetchPolicy: 'network-only' }
    )

    onBeforeMount(refetch)

    const onDialogClose = () => {
      state.showUploadDialog = false
    }

    const onUploadComplete = () => {
      onDialogClose()
      refetch()
    }

    return () => (
      <div>
        <header class="flex justify-between items-center py-3">
          <div class="flex items-center">
            <PrimaryIcon class="mx-3">
              <GroupSvg />
            </PrimaryIcon>
            <p class="m-0 ml-1 text-sm leading-5 text-gray-700">
              Databases are only available to members of this group.
              <br />
              You can choose to make derived annotations visible to others.
            </p>
          </div>
          <ElButton
            type="primary"
            onClick={() => {
              state.showUploadDialog = true
            }}
          >
            Upload Database
          </ElButton>
        </header>
        <ElTable
          v-loading={loading.value}
          data={result.value?.group?.molecularDatabases}
          default-sort={{ prop: 'createdDT', order: 'descending' }}
          style={{ width: '100%' }}
          onRowClick={props.handleRowClick}
          class="cursor-pointer"
        >
          <ElTableColumn
            prop="name"
            label="Name"
            minWidth={144}
            sortable
            sortBy={['name', 'version']}
            v-slots={{
              default: ({ row }: { row: any }) => (
                <span>
                  <span class="text-body font-medium">{row.name}</span> <span class="text-gray-700">{row.version}</span>
                </span>
              ),
            }}
          />
          <ElTableColumn
            prop="createdDT"
            label="Uploaded"
            minWidth={144}
            sortable
            v-slots={{
              default: ({ row }: { row: any }) => <ElapsedTime key={row.id} date={row.createdDT} />,
            }}
          />
          <ElTableColumn prop="user.name" label="Uploaded by" minWidth={144} sortable />
          <CheckColumn prop="isPublic" label="Public annotations" />
          <CheckColumn prop="archived" label="Archived" />
        </ElTable>
        {state.showUploadDialog && (
          <UploadDialog groupId={props.groupId} onClose={onDialogClose} onDone={onUploadComplete} />
        )}
      </div>
    )
  },
})

export default DatabasesTable
