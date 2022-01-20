import { defineComponent, reactive, onBeforeMount } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'

import UploadDialog from './UploadDialog'
import ElapsedTime from '../../components/ElapsedTime'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import SecondaryIcon from '../../components/SecondaryIcon.vue'

import CheckSvg from '../../assets/inline/refactoring-ui/icon-check.svg'
import GroupSvg from '../../assets/inline/refactoring-ui/icon-user-group.svg'

import { getGroupDatabasesQuery } from '../../api/group'

const CheckColumn = defineComponent({
  name: 'CheckColumn',
  props: {
    prop: { type: String, required: true },
    label: String,
  },
  setup(props) {
    return () => (
      <el-table-column
        prop={props.prop}
        label={props.label}
        width={144}
        align="center"
        {...{
          scopedSlots: {
            default: (scope: { row: any }) => (
              <span class="flex justify-center items-center h-5">
                { scope.row[props.prop]
                  ? <SecondaryIcon><CheckSvg /></SecondaryIcon>
                  : null }
              </span>
            ),
          },
        }}
      />
    )
  },
})

interface Props {
  handleRowClick: () => void
  groupId: string
}

const DatabasesTable = defineComponent<Props>({
  name: 'DatabasesTable',
  props: {
    handleRowClick: { type: Function, required: true },
    groupId: { type: String, required: true },
  },
  setup(props) {
    const state = reactive({
      showUploadDialog: false,
    })

    const { result, loading, refetch } = useQuery(
      getGroupDatabasesQuery,
      { groupId: props.groupId },
      { fetchPolicy: 'network-only' },
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
          <el-button type="primary" onClick={() => { state.showUploadDialog = true }}>
            Upload Database
          </el-button>
        </header>
        <el-table
          v-loading={loading.value}
          data={result.value?.group?.molecularDatabases}
          default-sort={{ prop: 'createdDT', order: 'descending' }}
          style="width: 100%"
          on={{
            'row-click': props.handleRowClick,
          }}
          row-class-name="cursor-pointer"
        >
          <el-table-column
            prop="name"
            label="Name"
            minWidth={144}
            sortable
            sortBy={['name', 'version']}
            {...{
              scopedSlots: {
                default: ({ row }: { row: any }) => (
                  <span>
                    <span class="text-body font-medium">{row.name}</span>
                    {' '}
                    <span class="text-gray-700">{row.version}</span>
                  </span>
                ),
              },
            }}
          />
          <el-table-column
            prop="createdDT"
            label="Uploaded"
            minWidth={144}
            sortable
            {...{
              scopedSlots: {
                default: ({ row }: { row: any }) => (
                  <ElapsedTime key={row.id} date={row.createdDT} />
                ),
              },
            }}
          />
          <el-table-column
            prop="user.name"
            label="Uploaded by"
            minWidth={144}
            sortable
          />
          <CheckColumn
            prop="isPublic"
            label="Public annotations"
          />
          <CheckColumn
            prop="archived"
            label="Archived"
          />
        </el-table>
        { state.showUploadDialog
          && <UploadDialog
            groupId={props.groupId}
            onClose={onDialogClose}
            onDone={onUploadComplete}
          /> }
      </div>
    )
  },
})

export default DatabasesTable
