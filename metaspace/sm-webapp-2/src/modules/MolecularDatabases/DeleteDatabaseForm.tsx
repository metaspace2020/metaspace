import { defineComponent } from 'vue'
import { useMutation } from '@vue/apollo-composable'

import confirmPrompt from '../../components/confirmPrompt'

import {
  deleteDatabaseMutation,
  DeleteDatabaseMutation,
  MolecularDB,
} from '../../api/moldb'
import { formatDatabaseLabel } from './formatting'
import {ElButton, ElMessage} from "element-plus";

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
          ElMessage({ message: `${formattedName} deleted`, type: 'success' })
          emit('deleted')
        } catch (e) {
          ElMessage({ message: 'Something went wrong, please try again', type: 'error' })
        }
      })
    }

    return () => (
      <form class="margin-reset">
        <h2>Delete database</h2>
        <p>Unprocessed dataset jobs using this database will also be removed.</p>
        <ElButton type="danger" class="mt-5" onClick={handleDelete}>
          Delete database
        </ElButton>
      </form>
    )
  },
})

export default Delete
