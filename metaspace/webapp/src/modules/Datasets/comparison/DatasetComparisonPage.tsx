import { computed, defineComponent, reactive } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { comparisonAnnotationListQuery } from '../../../api/annotation'
import AnnotationTable from '../../Annotations/AnnotationTable.vue'
import IonImageViewer from '../../../components/IonImageViewer'
import safeJsonParse from '../../../lib/safeJsonParse'
import { loadPngFromUrl, processIonImage } from '../../../lib/ionImageRendering'
import createColormap from '../../../lib/createColormap'

interface DatasetComparisonPageProps {
  className: string
}

export default defineComponent<DatasetComparisonPageProps>({
  name: 'DatasetComparisonPage',
  props: {
    className: {
      type: String,
      default: 'dataset-comparison',
    },
  },

  setup(props, ctx) {
    const { $router, $route, $store } = ctx.root
    const datasetId = computed(() => $route.params.dataset_id)
    const {
      result: annotationResult,
      loading: annotationLoading,
    } = useQuery<any>(comparisonAnnotationListQuery, {
      filter: { fdrLevel: 0.1, colocalizationAlgo: null, databaseId: 1 },
      dFilter: {
        ids: '2021-04-01_09h26m22s|2021-03-31_11h02m28s', polarity: null, metadataType: 'Imaging MS',
      },
      query: '',
      colocalizationCoeffFilter: null,
      orderBy: 'ORDER_BY_FORMULA',
      sortingOrder:
        'ASCENDING',
      countIsomerCompounds: true,
    })
    const annotations = computed(() => annotationResult.value != null
      ? annotationResult.value.allAggregatedAnnotations : null)

    const colormap = () => {
      return $store.getters.settings.annotationView.colormap
    }

    const ionImage = async(isotopeImage: any) => {
      if (!isotopeImage) {
        return null
      }

      const { minIntensity, maxIntensity } = isotopeImage
      const png = await loadPngFromUrl(isotopeImage.url)
      return processIonImage(png, minIntensity, maxIntensity, 'linear')
    }

    const ionImageLayers = (annotation: any) => {
      if (ionImage(annotation.isotopeImages[0])) {
        return [{
          ionImage: ionImage(annotation.isotopeImages[0]),
          colorMap: createColormap(colormap(), 'linear', 1),
        }]
      }
      return []
    }

    const getAnnotationData = (grid: any) => {
      if (!grid) {
        return {}
      }

      const auxGrid = safeJsonParse(grid)
      const gridWithInfo : any = {}
      const selectedAnnotation = annotations.value[0]

      Object.keys(auxGrid).forEach((key) => {
        const item = auxGrid[key]
        const dsIndex = selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item)
        if (dsIndex !== -1) {
          gridWithInfo[key] = selectedAnnotation.datasets[dsIndex]
        }
      })

      return gridWithInfo
    }

    return () => {
      const { nCols, nRows, grid } = $route.params
      const annotationData = getAnnotationData(grid)
      return (
        <div class='dataset-comparison-page w-full flex flex-wrap flex-row'>
          <div class='dataset-comparison-wrapper w-full md:w-1/2'>
            <AnnotationTable
              defaultAnnotations={(annotations.value || []).map((ion: any) => ion.datasets[0])}
              hideColumns={['ColocalizationCoeff', 'Dataset']}/>
          </div>
          <div class='dataset-comparison-wrapper w-full md:w-1/2'>
            <div class='dataset-comparison-grid'>
              {nRows
                && Array.from(Array(parseInt(nRows, 10)).keys()).map((row) => {
                  return (
                    <div key={row} class='dataset-comparison-row'>
                      {
                        nCols
                      && Array.from(Array(parseInt(nCols, 10)).keys()).map((col) => {
                        return (
                          <div key={col} class='dataset-comparison-col' style={{ height: 100, width: 100 }}>
                            {
                              annotationData
                            && annotationData[`${row}-${col}`]
                            && <IonImageViewer
                              ionImageLayers={ionImageLayers(annotationData[`${row}-${col}`])}
                              height={100}
                              width={100}
                              xOffset={0}
                              yOffset={0}
                              zoom={1}/>
                            }
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )
    }
  },
})
