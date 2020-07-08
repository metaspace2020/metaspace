import { createComponent } from '@vue/composition-api'
import { useMutation } from '@vue/apollo-composable'

import confirmPrompt from '../../components/confirmPrompt'

import { deleteDatabaseMutation } from '../../api/moldb'

const Delete = createComponent({
  props: {
    id: { type: Number, required: true },
  },
  setup(props, { root, emit }) {
    const {
      mutate: deleteDatabase,
    } = useMutation(deleteDatabaseMutation)

    const handleDelete = () => {
      confirmPrompt({
        title: '',
        message: 'Are you sure you want to delete this database?',
        confirmButtonText: 'Delete',
        confirmButtonLoadingText: 'Deleting...',
      }, async() => {
        try {
          await deleteDatabase({ id: props.id })
          root.$message({ message: 'Database deleted', type: 'success' })
          emit('deleted')
        } catch (e) {
          root.$message({ message: 'Something went wrong, please try again', type: 'error' })
        }
      })
    }

    return () => (
      <form class="margin-reset">
        <h2>Delete database</h2>
        <p>Unprocessed dataset jobs using this database will also be removed.</p>
        <el-button type="danger" class="mt-5" onClick={handleDelete}>
          Delete database
        </el-button>
      </form>
    )
  },
})

export default Delete
