import { defineComponent, reactive } from 'vue'

import FadeTransition from '../../components/FadeTransition'
import { ElButton } from 'element-plus'

interface Props {
  archived: boolean
  submit: (update: { archived: boolean }) => void
}

const Archive = defineComponent<Props>({
  name: 'ArchiveDatabaseForm',
  props: {
    archived: { type: Boolean, required: true },
    submit: { type: Function, required: true },
  },
  setup(props) {
    const state = reactive({
      loading: false,
    })

    const setArchived = async (archived: boolean) => {
      state.loading = true
      await props.submit({ archived })
      state.loading = false
    }

    return () => (
      <FadeTransition>
        {props.archived ? (
          <form class="margin-reset mt-12" key="archived">
            <h2>Un-archive database</h2>
            <p>Database will be available for dataset processing again.</p>
            <ElButton class="mt-5" loading={state.loading} onClick={() => setArchived(false)}>
              Un-archive database
            </ElButton>
          </form>
        ) : (
          <form class="margin-reset mt-12">
            <h2>Archive database</h2>
            <p>Database will not be available for dataset processing.</p>
            <ElButton class="mt-5" loading={state.loading} onClick={() => setArchived(true)}>
              Archive database
            </ElButton>
          </form>
        )}
      </FadeTransition>
    )
  },
})

export default Archive
