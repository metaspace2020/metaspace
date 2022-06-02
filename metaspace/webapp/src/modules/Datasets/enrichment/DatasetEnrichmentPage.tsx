import {
  computed,
  defineComponent,
  reactive,
} from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { getDatasetByIdQuery, GetDatasetByIdQuery, getDatasetEnrichmentQuery } from '../../../api/dataset'
import { DatasetEnrichmentChart } from './DatasetEnrichmentChart'
import { DatasetEnrichmentTable } from './DatasetEnrichmentTable'
import './DatasetEnrichmentPage.scss'

interface DatasetEnrichmentPageProps {
  className: string
}

interface DatasetEnrichmentPageState {
  offset: number
  pageSize: number
  sortedData: any
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
    const { $route, $router } = root
    const state = reactive<DatasetEnrichmentPageState>({
      offset: 0,
      pageSize: 15,
      sortedData: undefined,
    })
    const datasetId = computed(() => $route.params.dataset_id)
    const { db_id: dbId } = $route.query

    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, { id: datasetId })
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.dataset : null)
    const {
      result: enrichmentResult,
      loading: enrichmentLoading,
    } = useQuery<any>(getDatasetEnrichmentQuery, { id: datasetId, dbId: parseInt(dbId, 10) })
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

    const handleSortChange = (newData: number) => {
      state.sortedData = newData
    }

    const handleItemClick = (item: any) => {
      const routeData = $router.resolve({
        name: 'annotations',
        query: { term: item?.termId, ds: datasetId.value, db_id: dbId, mol_class: '1' },
      })
      window.open(routeData.href, '_blank')
    }

    return () => {
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      const data = enrichment.value || []
      const usedData = state.sortedData ? state.sortedData : data
      const pagedData = usedData.slice(dataStart, dataEnd)

      if (enrichmentLoading.value) {
        return <div class='dataset-enrichment-loading'>
          <i
            class="el-icon-loading"
          />
          <span>Loading...</span>
        </div>
      }

      return (
        <div class='dataset-enrichment-page'>
          <div class={'dataset-enrichment-wrapper'}>
            <DatasetEnrichmentTable
              data={data}
              onPageChange={handlePageChange}
              onSizeChange={handleSizeChange}
              onSortChange={handleSortChange}
            />
          </div>
          <div class={'dataset-enrichment-wrapper text-center'}>
            {dataset.value?.name} - enrichment
            {
              !(!data || (data || []).length === 0)
              && <DatasetEnrichmentChart data={pagedData} onItemSelected={handleItemClick}/>
            }
          </div>
        </div>
      )
    }
  },
})
