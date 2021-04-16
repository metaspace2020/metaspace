import { computed, defineComponent, onMounted, reactive, ref } from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { comparisonAnnotationListQuery } from '../../../api/annotation'
import safeJsonParse from '../../../lib/safeJsonParse'
import { loadPngFromUrl, processIonImage } from '../../../lib/ionImageRendering'
import createColormap from '../../../lib/createColormap'
import MainImage from '../../Annotations/annotation-widgets/default/MainImage.vue'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import Vue from 'vue'
import { Collapse, CollapseItem } from '../../../lib/element-ui'
import ImageSaver from '../../ImageViewer/ImageSaver.vue'
import OpacitySettings from '../../ImageViewer/OpacitySettings.vue'
import FadeTransition from '../../../components/FadeTransition'
import useIonImages from '../../ImageViewer/useIonImages'
import AnnotationTable from '../../Annotations/AnnotationTable.vue'

interface DatasetComparisonPageProps {
  className: string
  defaultImagePosition: any
}

export default defineComponent<DatasetComparisonPageProps>({
  name: 'DatasetComparisonPage',
  props: {
    className: {
      type: String,
      default: 'dataset-comparison',
    },
    defaultImagePosition: {
      type: Object,
      default: () => ({
        zoom: 1,
        xOffset: 0,
        yOffset: 0,
      }),
    },
  },

  // @ts-ignore
  setup(props, { refs, root }) {
    const { $route, $store } = root
    const gridNode = ref(null)
    const state = reactive<any>({
      selectedAnnotation: 0,
      gridState: {},
      refsLoaded: false,
    })

    onMounted(() => {
      state.refsLoaded = true
    })

    const {
      result: annotationResult,
      loading: annotationLoading,
    } = useQuery<any>(comparisonAnnotationListQuery, {
      filter: { fdrLevel: 0.1, colocalizationAlgo: null, databaseId: 1 },
      dFilter: {
        ids: '2021-04-01_09h26m22s|2021-04-14_07h23m35s|2021-04-06_08h35m04s|2021-03-31_11h02m28s',
        polarity: null,
        metadataType: 'Imaging MS',
      },
      type: 'SCALED',
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

    const handleRowChange = (idx: number) => {
      if (idx !== -1) {
        state.selectedAnnotation = idx
      }
    }

    const ionImage = async(isotopeImage: any) => {
      if (!isotopeImage) {
        return null
      }

      const { minIntensity, maxIntensity } = isotopeImage
      const png = await loadPngFromUrl(isotopeImage.url)
      return processIonImage(png, minIntensity, maxIntensity, 'linear')
    }

    const ionImageLayers = async(annotation: any) => {
      const finalImage = await ionImage(annotation.isotopeImages[0])
      if (finalImage) {
        return [{
          ionImage: finalImage,
          colorMap: createColormap(colormap(), 'linear', 1),
        }]
      }
      return []
    }

    const handleImageMove = (event: any, key: string) => {
      if (!state.gridState[key]) {
        state.gridState[key] = {}
      }
      if (!state.gridState[key].imagePosition) {
        state.gridState[key].imagePosition = {}
      }

      Vue.set(state.gridState, key, { ...state.gridState[key], imagePosition: { ...event } })
    }

    const handleOpacityChange = (opacity: any, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], annotImageOpacity: opacity })
    }

    const getImagePosition = (key: string) => {
      if (state.gridState[key] && state.gridState[key].imagePosition) {
        return state.gridState[key].imagePosition
      }
      return props.defaultImagePosition
    }

    const getImageSettings = (key: string, annotation: any) => {
      if (state.gridState && state.gridState[key]) {
        return state.gridState[key]
      }

      return {
        annotImageOpacity: 1.0,
        opacityMode: 'linear',
        imagePosition: props.defaultImagePosition,
        pixelAspectRatio: 1,
        imageZoom: 1,
        showOpticalImage: true,
      }
    }

    const getAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !annotations.value) {
        return {}
      }

      const auxGrid = safeJsonParse(grid)
      const gridWithInfo : any = {}
      const selectedAnnotation = annotations.value[annotationIdx]

      Object.keys(auxGrid).forEach(async(key) => {
        const item = auxGrid[key]
        const dsIndex = selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item)
        if (dsIndex !== -1) {
          gridWithInfo[key] = selectedAnnotation.datasets[dsIndex]
          const {
            ionImageLayers,
            ionImageMenuItems,
            singleIonImageControls,
            ionImagesLoading,
            ionImageDimensions,
          } = useIonImages({
            annotation: gridWithInfo[key],
            scaleType: $store.getters.settings.annotationView.scaleType,
            colormap: $store.getters.settings.annotationView.colormap,
            imageLoaderSettings: getImageSettings(key, selectedAnnotation.datasets[dsIndex]),
          })

          Vue.set(state.gridState, key, getImageSettings(key, selectedAnnotation.datasets[dsIndex]))
          // gridWithInfo[key].ionImageLayers = await ionImageLayers(selectedAnnotation.datasets[dsIndex])
          gridWithInfo[key].singleIonImageControls = singleIonImageControls
        }
      })

      return gridWithInfo
    }

    const resetViewPort = (event: any, key: string) => {
      event.stopPropagation()
      Vue.set(state.gridState, key, { ...state.gridState[key], imagePosition: props.defaultImagePosition })
    }

    const toggleOpticalImage = (event: any, key: string) => {
      event.stopPropagation()
      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        showOpticalImage: !state.gridState[key].showOpticalImage,
        annotImageOpacity:
          !state.gridState[key].showOpticalImage ? state.gridState[key].annotImageOpacity : 1,
      })
    }

    // const { nCols, nRows, grid } = $route.params
    const nCols = '2'
    const nRows = '2'
    const grid = JSON.stringify({
      '0-0': '2021-04-06_08h35m04s',
      '0-1': '2021-03-31_11h02m28s',
      '1-1': '2021-04-01_09h26m22s',
      '1-0': '2021-04-14_07h23m35s',
    })
    const annotationData = computed(() => getAnnotationData(grid, state.selectedAnnotation))

    return () => {
      console.log('annotations.value', annotations.value)
      return (
        <div class='dataset-comparison-page w-full flex flex-wrap flex-row'>
          <div class='dataset-comparison-wrapper w-full md:w-1/2'>
            <AnnotationTable
              defaultAnnotations={(annotations.value || []).map((ion: any) => ion.datasets[0])}
              onRowChange={handleRowChange}
              hideColumns={['ColocalizationCoeff', 'Dataset']}/>
          </div>
          <div class='dataset-comparison-wrapper  w-full  md:w-1/2'>
            <Collapse value={'images'} id="annot-content"
              class="border-0">
              <CollapseItem
                id="annot-img-collapse"
                name="images"
                title="Image viewer"
                class="ds-collapse el-collapse-item--no-padding relative">
                <ImageSaver
                  class="absolute top-0 right-0 mt-2 mr-2 dom-to-image-hidden"
                  domNode={gridNode.value}
                />
                <div class='dataset-comparison-grid' ref={gridNode}>
                  {nRows
                  && Array.from(Array(parseInt(nRows, 10)).keys()).map((row) => {
                    return (
                      <div key={row} class='dataset-comparison-row'>
                        {
                          nCols
                          && Array.from(Array(parseInt(nCols, 10)).keys()).map((col) => {
                            return (
                              <div key={col} class='dataset-comparison-col overflow-hidden'
                                style={{ height: 200, width: 200 }}>
                                <MainImageHeader
                                  class='dataset-comparison-grid-item-header dom-to-image-hidden'
                                  annotation={annotationData.value[`${row}-${col}`]}
                                  slot="title"
                                  scaleBarColor="#000000"
                                  scaleType={$store.getters.settings.annotationView.scaleType}
                                  isActive={true}
                                  showOpticalImage={!!state.gridState[`${row}-${col}`]?.showOpticalImage}
                                  toggleOpticalImage={(e: any) => toggleOpticalImage(e, `${row}-${col}`)}
                                  resetViewport={(e: any) => resetViewPort(e, `${row}-${col}`)}
                                  hasOpticalImage={
                                    annotationData.value[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
                                    !== undefined}
                                />
                                <div ref={`image-${row}-${col}`} class='relative'>
                                  {
                                    state.gridState[`${row}-${col}`] !== undefined
                                  && <MainImage
                                    hideColorBar
                                    imageViewerWidth={410}
                                    imageViewerHeight={300}
                                    annotation={annotationData.value[`${row}-${col}`]}
                                    colormap={$store.getters.settings.annotationView.colormap}
                                    opacity={state.gridState[`${row}-${col}`]?.annotImageOpacity !== undefined
                                      ? state.gridState[`${row}-${col}`]?.annotImageOpacity : 1}
                                    imagePosition={() => getImagePosition(`${row}-${col}`) }
                                    applyImageMove={(e: any) => handleImageMove(e, `${row}-${col}`)}
                                    imageLoaderSettings={{
                                      ...state.gridState[`${row}-${col}`],
                                      opticalSrc: state.gridState[`${row}-${col}`]?.showOpticalImage
                                        ? annotationData.value[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
                                        : undefined,
                                      opticalTransform: state.gridState[`${row}-${col}`]?.showOpticalImage
                                        ? annotationData.value[`${row}-${col}`]?.dataset?.opticalImages[0]?.transform
                                        : undefined,

                                    }}
                                    onOpacity={(opacity: number) => handleOpacityChange(opacity, `${row}-${col}`) }
                                  />
                                  }
                                  <div
                                    class="absolute top-0 right-0 py-3 mr-2 h-full
                                    box-border flex flex-col justify-between items-end
                                     w-0 v-rhythm-3 sm-side-bar"
                                  >
                                    <FadeTransition>
                                      {
                                        state.gridState[`${row}-${col}`]?.showOpticalImage
                                      && annotationData.value[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
                                      !== undefined
                                      && <OpacitySettings
                                        key="opacity"
                                        class="ds-comparison-opacity-item sm-leading-trim mt-auto dom-to-image-hidden"
                                        opacity={state.gridState[`${row}-${col}`]?.annotImageOpacity !== undefined
                                          ? state.gridState[`${row}-${col}`]?.annotImageOpacity : 1}
                                        onOpacity={(opacity: number) => handleOpacityChange(opacity, `${row}-${col}`)}
                                      />
                                      }
                                    </FadeTransition>
                                  </div>
                                  {
                                    state.refsLoaded
                                      && <ImageSaver
                                        class="absolute top-0 left-0 mt-3 ml-3 dom-to-image-hidden"
                                        domNode={refs[`image-${row}-${col}`]}
                                      />
                                  }
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
                </div>
              </CollapseItem>
            </Collapse>
          </div>

        </div>
      )
    }
  },
})
