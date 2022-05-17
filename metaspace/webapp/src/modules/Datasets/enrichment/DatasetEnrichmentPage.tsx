import {
  computed,
  defineComponent,
  reactive,
} from '@vue/composition-api'
import config from '../../../lib/config'
import { useQuery } from '@vue/apollo-composable'
import { getDatasetEnrichmentQuery } from '../../../api/dataset'
import { DatasetEnrichmentChart } from './DatasetEnrichmentChart'

interface DatasetEnrichmentPageProps {
  className: string
}

interface DatasetEnrichmentPageState {
  showChart: boolean
}

export default defineComponent<DatasetEnrichmentPageProps>({
  name: 'DatasetEnrichmentPage',
  props: {
    className: {
      type: String,
      default: 'dataset-enrichment',
    },
  },

  // @ts-ignore
  setup(props, { refs, root }) {
    const { $route, $store } = root
    const state = reactive<DatasetEnrichmentPageState>({
      showChart: true,
    })
    const { dataset_id: sourceDsId } = $route.params

    const queryVariables = () => {
      const filter = $store.getters.gqlAnnotationFilter
      const dFilter = $store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = $store.getters.gqlColocalizationFilter
      const query = $store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        countIsomerCompounds: config.features.isomers,
      }
    }

    const {
      result: enrichmentResult,
      loading: enrichmentLoading,
    } = useQuery<any>(getDatasetEnrichmentQuery, { id: sourceDsId })
    const enrichment = computed(() => {
      if (enrichmentResult.value) {
        return enrichmentResult.value.lipidEnrichment
      }
      return null
    })

    return () => {
      const { showChart } = state
      const data = Array.isArray(enrichment.value) ? enrichment.value.slice(0, 15) : []

      return (
        <div class='dataset-enrichment-page'>
          {
            !enrichmentLoading.value
            && <DatasetEnrichmentChart data={data}/>
          }
        </div>
      )
    }
  },
})
