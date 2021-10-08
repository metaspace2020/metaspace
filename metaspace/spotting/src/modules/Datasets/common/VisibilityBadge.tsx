import { computed, defineComponent, reactive } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { datasetVisibilityQuery, DatasetVisibilityQuery } from '../../../api/dataset'
import { Popover } from '../../../lib/element-ui'

const VisibilityBadge = defineComponent({
  props: {
    datasetId: { type: String, required: true },
  },
  setup(props) {
    const queryOptions = reactive({ enabled: false })
    const queryVars = computed(() => ({ id: props.datasetId }))
    const query = useQuery<DatasetVisibilityQuery>(datasetVisibilityQuery, queryVars, queryOptions)
    const loadVisibility = () => { queryOptions.enabled = true }

    const visibilityText = computed(() => {
      if (query.result.value != null) {
        const { datasetVisibility, currentUser } = query.result.value
        if (datasetVisibility != null) {
          const { submitter, group, projects } = datasetVisibility
          const submitterName = currentUser && submitter.id === currentUser.id ? 'you' : submitter.name
          const all = [
            submitterName,
            ...(group ? [group.name] : []),
            ...(projects || []).map(p => p.name),
          ]
          return 'These annotation results are not publicly visible. '
            + `They are visible to ${all.join(', ')} and METASPACE Administrators.`
        }
      }
      return null
    })

    return () => (
      <Popover
        class="ml-1"
        trigger="hover"
        placement="top"
        onShow={loadVisibility}
      >
        <div v-loading={visibilityText.value == null}>{visibilityText.value || ''}</div>
        <i
          slot="reference"
          class="el-icon-lock"
        />
      </Popover>
    )
  },
})

export default VisibilityBadge
