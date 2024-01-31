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
import { uniqBy } from 'lodash-es'

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

    const {
      result: datasetResult,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, { id: datasetId })

    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.dataset : null)
    const {
      result: databasesResult,
      onResult: handleMolDbLoad,
    } = useQuery<any>(getEnrichedMolDatabasesQuery, { id: datasetId })

    handleMolDbLoad(async(result) => {
      const filter = Object.assign({}, $store.getters.filter)

      // set default db filter if not selected
      if (!filter.database) {
        filter.database = result?.data?.allEnrichedMolDatabases[0]?.id
        $store.commit('updateFilter', filter)
      }
    })

    const databases = computed(() => databasesResult.value != null
      ? databasesResult.value.allEnrichedMolDatabases : null)
    const {
      result: enrichmentResult,
      loading: enrichmentLoading,
    } = useQuery<any>(getDatasetEnrichmentQuery, computed(() => ({
      id: datasetId,
      dbId: $store.getters.gqlAnnotationFilter.databaseId,
      fdr: $store.getters.gqlAnnotationFilter.fdrLevel,
      pValue: ($store.getters.gqlAnnotationFilter.pValue === null
        || $store.getters.gqlAnnotationFilter.pValue === undefined)
        ? undefined : $store.getters.gqlAnnotationFilter.pValue,
      offSample: ($store.getters.gqlAnnotationFilter.offSample === null
      || $store.getters.gqlAnnotationFilter.offSample === undefined)
        ? undefined : !!$store.getters.gqlAnnotationFilter.offSample,
    })), { fetchPolicy: 'cache-first' as const })

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
      const dbId = $store.getters.gqlAnnotationFilter.databaseId
      const fdr = $store.getters.gqlAnnotationFilter.fdrLevel

      const routeData = $router.resolve({
        name: 'annotations',
        query: {
          term: item?.termId,
          ds: datasetId.value,
          db_id: dbId,
          mol_class: '1',
          fdr,
          feat: 'enrichment',
        },
      })
      window.open(routeData.href, '_blank')
    }

    return () => {
      const dataStart = ((state.offset - 1) * state.pageSize)
      const dataEnd = ((state.offset - 1) * state.pageSize) + state.pageSize
      const data = enrichment.value || []
      const usedData = state.sortedData ? state.sortedData : data
      const pagedData = usedData.slice(dataStart, dataEnd)
      const databaseOptions : any = databases.value || []
      const filename : string = `${dataset.value?.name}_${(databases.value || []).find((database:any) => database.id
        === $store.getters.gqlAnnotationFilter.databaseId)?.name}`.replace(/\./g, '_')

      return (
        <div class='dataset-enrichment-page'>
          {
            databases.value
            && <FilterPanel
              class='w-full'
              level='enrichment'
              fixedOptions={{
                database: uniqBy(databaseOptions, 'id'),
              }}
            />
          }
          {
            enrichmentLoading.value
            && <div class='w-full h-full flex items-center justify-center'>
              <i
                class="el-icon-loading"
              />
              <span>Loading...</span>
            </div>
          }
          {
            !enrichmentLoading.value
            && <div class={'dataset-enrichment-wrapper md:w-1/2 w-full'}>
              <DatasetEnrichmentTable
                dsName={dataset.value?.name}
                data={data}
                filename={`${filename}_enrichment.csv`}
                onPageChange={handlePageChange}
                onSizeChange={handleSizeChange}
                onSortChange={handleSortChange}
              />
            </div>
          }
          {
            !enrichmentLoading.value
            && <div class={'dataset-enrichment-wrapper text-center md:w-1/2 w-full'}>
              {dataset.value?.name} - <a target='_blank' href='http://www.lipidontology.com/'>LION</a> terms enrichment
              {
                !(!data || (data || []).length === 0)
                && <DatasetEnrichmentChart
                  data={pagedData}
                  onItemSelected={handleItemClick}
                  filename={`Enrichment_${filename}_LION`}
                />
              }
            </div>
          }
        </div>
      )
    }
  },
})
