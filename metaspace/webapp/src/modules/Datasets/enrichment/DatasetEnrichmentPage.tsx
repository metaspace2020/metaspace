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
import { getEnrichedMolDatabasesQuery } from '../../../api/enrichmentdb'
import FilterPanel from '../../Filters/FilterPanel.vue'

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
    const { $route, $router, $store } = root
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
      result: databasesResult,
      loading: databasesLoading,
    } = useQuery<any>(getEnrichedMolDatabasesQuery, { id: datasetId })
    const databases = computed(() => databasesResult.value != null
      ? databasesResult.value.allEnrichedMolDatabases : null)
    const {
      result: enrichmentResult,
      loading: enrichmentLoading,
    } = useQuery<any>(getDatasetEnrichmentQuery, computed(() => ({
      id: datasetId,
      dbId: $store.getters.gqlAnnotationFilter.databaseId,
      fdr: $store.getters.gqlAnnotationFilter.fdrLevel,
      offSample: ($store.getters.gqlAnnotationFilter.offSample === null
      || $store.getters.gqlAnnotationFilter.offSample === undefined)
        ? undefined : !!$store.getters.gqlAnnotationFilter.offSample,
    })), { fetchPolicy: 'no-cache' as const })

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

      return (
        <div class='dataset-enrichment-page'>
          {
            databases.value
            && <FilterPanel
              class='w-full'
              level='enrichment'
              fixedOptions={{ database: (databases.value || []) }}
            />
          }
          {
            enrichmentLoading.value
            && <div class='dataset-enrichment-loading'>
              <i
                class="el-icon-loading"
              />
              <span>Loading...</span>
            </div>
          }
          {
            !enrichmentLoading.value
            && <div class={'dataset-enrichment-wrapper'}>
              <DatasetEnrichmentTable
                data={data}
                filename={`${dataset.value?.name}_${databases.value.find((database:any) => database.id
                  === $store.getters.gqlAnnotationFilter.databaseId)?.name}_enrichment.csv`}
                onPageChange={handlePageChange}
                onSizeChange={handleSizeChange}
                onSortChange={handleSortChange}
              />
            </div>
          }
          {
            !enrichmentLoading.value
            && <div class={'dataset-enrichment-wrapper text-center'}>
              {dataset.value?.name} - enrichment
              {
                !(!data || (data || []).length === 0)
                && <DatasetEnrichmentChart data={pagedData} onItemSelected={handleItemClick}/>
              }
            </div>
          }
        </div>
      )
    }
  },
})
