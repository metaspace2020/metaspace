import { defineComponent } from '@vue/composition-api'
import { useMutation } from '@vue/apollo-composable'

import confirmPrompt from '../../components/confirmPrompt'

import {
  deleteDatabaseMutation,
  DeleteDatabaseMutation,
  MolecularDB,
} from '../../api/moldb'
import { formatDatabaseLabel } from './formatting'

interface Props {
  db: MolecularDB
}

const Delete = defineComponent<Props>({
  name: 'DeleteDatabaseForm',
  props: {
    db: { type: Object, required: true },
  },
  setup(props, { root, emit }) {
    const { mutate } = useMutation(deleteDatabaseMutation)
    const deleteDatabase = mutate as unknown as (variables: DeleteDatabaseMutation) => void

    const formattedName = formatDatabaseLabel(props.db)

    const handleDelete = () => {
      confirmPrompt({
        title: '',
        message: `Are you sure you want to delete ${formattedName}?`,
        confirmButtonText: 'Delete',
        confirmButtonLoadingText: 'Deleting...',
      }, async() => {
        try {
          await deleteDatabase({ id: props.db.id })
          root.$message({ message: `${formattedName} deleted`, type: 'success' })
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
