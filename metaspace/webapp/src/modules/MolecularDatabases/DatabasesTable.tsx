import { createComponent, createElement } from '@vue/composition-api'

const DatabasesTable = createComponent({
  props: {
    databases: Array,
    handleRowClick: { type: Function, required: true },
  },
  setup(props) {
    return () => (
      <el-table
        data={props.databases}
        default-sort={{ prop: 'name' }}
        style="width: 100%"
        on={{
          'row-click': props.handleRowClick,
        }}
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
    )
  },
})

export default DatabasesTable
