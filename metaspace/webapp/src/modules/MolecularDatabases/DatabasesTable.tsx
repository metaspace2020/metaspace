import { createComponent, createElement, reactive } from '@vue/composition-api'

import '../../components/ColourIcon.css'
import GroupIcon from '../../assets/inline/refactoring-ui/group.svg'

import UploadDialog from './UploadDialog'

const DatabasesTable = createComponent({
  props: {
    databases: Array,
    handleRowClick: { type: Function, required: true },
    groupId: { type: String, required: true },
  },
  setup(props) {
    const state = reactive({
      showUploadDialog: false,
    })
    return () => (
      <div>
        <header class="flex justify-between items-center py-3">
          <div class="flex items-center">
            <GroupIcon class="sm-colour-icon mx-3 w-6 h-6" />
            <p class="m-0 ml-2 text-sm leading-5 text-gray-700">
              Databases are only available to members of this group.
              <br />
              You can choose to make the annotations visible to others.
            </p>
          </div>
          <el-button type="primary" onClick={() => { state.showUploadDialog = true }}>
            Upload Database
          </el-button>
        </header>
        <el-table
          data={props.databases}
          default-sort={{ prop: 'name', order: 'ascending' }}
          style="width: 100%"
          on={{
            'row-click': props.handleRowClick,
          }}
          row-class-name="cursor-pointer"
        >
          {createElement('el-table-column', {
            props: {
              prop: 'name',
              label: 'Name',
              minWidth: 144,
              sortable: true,
              sortBy: ['name', 'version'],
            },
            scopedSlots: {
              default: ({ row }) => (
                <span>
                  <span class="text-body font-medium">{row.name}</span>
                  {' '}
                  <span class="text-gray-700">{row.version}</span>
                </span>
              ),
            },
          })}
          <el-table-column
            prop="uploadDT"
            label="Uploaded"
            sortable
            min-width={144}
          />
          <el-table-column
            prop="archived"
            label="Archived"
            align="center"
            width={144}
          />
          <el-table-column
            prop="public"
            label="Public"
            align="center"
            width={144}
          />
        </el-table>
        { state.showUploadDialog
          && <UploadDialog
            groupId={props.groupId}
            onClose={() => { state.showUploadDialog = false }}
          /> }
      </div>
    )
  },
})

export default DatabasesTable
