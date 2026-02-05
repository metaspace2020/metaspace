import { computed, defineComponent } from 'vue'
import { useRoute } from 'vue-router'
import './DatasetDiffAnalysisPage.scss'

export default defineComponent({
  name: 'DatasetDiffAnalysisPage',
  props: {
    className: {
      type: String,
      default: 'dataset-diff',
    },
  },
  setup() {
    const route = useRoute()
    const datasetId = computed(() => route.params.dataset_id)

    return () => {
      return <div class="dataset-diff-page">{datasetId.value}</div>
    }
  },
})
