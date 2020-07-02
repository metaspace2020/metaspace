import { createComponent } from '@vue/composition-api'

import confirmPrompt from '../../components/confirmPrompt'

const Delete = createComponent({
  props: {
    submit: { type: Function, required: true },
  },
  setup(props) {
    const handleDelete = () => {
      confirmPrompt({
        title: '',
        message: 'Are you sure you want to delete this database?',
        confirmButtonText: 'Delete',
        confirmButtonLoadingText: 'Deleting...',
      }, props.submit)
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
