import {
  computed,
  defineComponent,
  reactive,
} from '@vue/composition-api'
import config from '../../../lib/config'
import { useQuery } from '@vue/apollo-composable'
import { getDatasetEnrichmentQuery } from '../../../api/dataset'
import { DatasetEnrichmentChart } from './DatasetEnrichmentChart'
import { DatasetEnrichmentTable } from './DatasetEnrichmentTable'
import './DatasetEnrichmentPage.scss'

interface DatasetEnrichmentPageProps {
  className: string
}

interface DatasetEnrichmentPageState {
  showChart: boolean
  offset: number
  pageSize: number
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
      offset: 0,
      pageSize: 15,
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

    const handlePageChange = (offset: number) => {
      state.offset = offset
    }
    const handleSizeChange = (pageSize: number) => {
      state.pageSize = pageSize
    }

    return () => {
      const { showChart } = state
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      const data = Array.isArray(enrichment.value) ? enrichment.value : []
      const pagedData = data.slice(dataStart, dataEnd)

      return (
        <div class='dataset-enrichment-page'>
          <div class={'dataset-enrichment-wrapper'}>
            <DatasetEnrichmentTable
              data={data}
              onPageChange={handlePageChange}
              onSizeChange={handleSizeChange}
            />
          </div>
          <div class={'dataset-enrichment-wrapper'}>
            {
              !enrichmentLoading.value
              && <DatasetEnrichmentChart data={pagedData}/>
            }
          </div>
        </div>
      )
    }
  },
})
