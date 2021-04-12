import { computed, defineComponent, reactive } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { comparisonAnnotationListQuery } from '../../../api/annotation'

interface Props {
  className: string
}

export default defineComponent<Props>({
  name: 'DatasetComparisonPage',
  props: {
    className: {
      type: String,
      default: 'dataset-comparison',
    },
  },

  setup(props, ctx) {
    const { $router, $route } = ctx.root
    const datasetId = computed(() => $route.params.dataset_id)
    const {
      result: annotationResult,
      loading: annotationLoading,
    } = useQuery<any>(comparisonAnnotationListQuery, {
      filter: {
        fdrLevel: 0.1,
        colocalizationAlgo: null,
        databaseId: 1,
      },
      dFilter: {
        ids: '2021-04-01_09h26m22s|2021-03-31_11h02m28s',
        polarity: null,
        metadataType: 'Imaging MS',
      },
      query: '',
      colocalizationCoeffFilter: null,
      orderBy: 'ORDER_BY_MSM',
      sortingOrder: 'DESCENDING',
      offset: 0,
      limit: 15,
      countIsomerCompounds: true,
    })
    const annotations = computed(() => annotationResult.value != null
      ? annotationResult.value.allAggregatedAnnotations : null)

    return () => {
      return (
        <div class='sm-content-page'>
          New page
        </div>
      )
    }
  },
})
