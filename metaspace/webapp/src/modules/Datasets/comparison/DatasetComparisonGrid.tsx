import { computed, defineComponent, onMounted, onUnmounted, reactive, watch } from '@vue/composition-api'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import Vue from 'vue'
import safeJsonParse from '../../../lib/safeJsonParse'
import { encodeParams } from '../../Filters'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Button, Popover } from '../../../lib/element-ui'
import { range } from 'lodash-es'
import { SimpleIonImageViewer } from '../../../components/SimpleIonImageViewer/SimpleIonImageViewer'
import MonitorSvg from '../../../assets/inline/refactoring-ui/icon-monitor.svg'
import './DatasetComparisonGrid.scss'

const RouterLink = Vue.component('router-link')

interface DatasetComparisonGridProps {
  nCols: number
  nRows: number
  settings: any
  colormap: string
  scaleType: string
  scaleBarColor: string
  selectedAnnotation: number
  annotations: any[]
  normalizationData: any
  datasets: any[]
  isLoading: boolean
  resetViewPort: boolean
  isNormalized: boolean
  lockedIntensityTemplate: string
  globalLockedIntensities: [number | undefined, number | undefined]
  mode: string
}

interface GridCellState {
  showOpticalImage: boolean
  isActive: boolean
}

interface DatasetComparisonGridState {
  gridState: Record<string, GridCellState | null>,
  grid: any,
  annotationData: any,
  annotations: any[],
  refsLoaded: boolean,
  showViewer: boolean,
  annotationLoading: boolean,
  firstLoaded: boolean,
  filter: any
  selectedAnnotation: number
  singleAnnotationId: any
}

const channels: any = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
}

export const DatasetComparisonGrid = defineComponent<DatasetComparisonGridProps>({
  name: 'DatasetComparisonGrid',
  props: {
    nCols: {
      type: Number,
      required: true,
      default: 2,
    },
    nRows: {
      type: Number,
      required: true,
      default: 2,
    },
    settings: {
      type: Object,
      required: true,
    },
    selectedAnnotation: {
      type: Number,
    },
    annotations: {
      type: Array,
      required: true,
    },
    normalizationData: {
      type: Object,
      default: () => {},
    },
    datasets: {
      type: Array,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    resetViewPort: {
      type: Boolean,
      default: false,
    },
    isNormalized: {
      type: Boolean,
      default: false,
    },
    colormap: {
      type: String,
      default: 'Viridis',
    },
    scaleType: {
      type: String,
      default: 'linear',
    },
    scaleBarColor: {
      type: String,
      default: '#000000',
    },
    lockedIntensityTemplate: {
      type: String,
    },
    mode: {
      type: String,
      default: 'SINGLE',
    },
    globalLockedIntensities: {
      type: Array,
      default: () => [undefined, undefined],
    },
  },
  // @ts-ignore
  setup: function(props, { refs, emit, root }) {
    const { $store } = root

    const state = reactive<DatasetComparisonGridState>({
      gridState: {},
      grid: undefined,
      annotations: [],
      annotationData: {},
      selectedAnnotation: props.selectedAnnotation,
      refsLoaded: false,
      showViewer: false,
      annotationLoading: true,
      firstLoaded: false,
      filter: $store?.getters?.filter,
      singleAnnotationId: {},
    })

    const dimensions = reactive({
      width: 410,
      height: 300,
    })

    const resizeHandler = () => {
      let width = 0
      let height = 0
      Object.keys(refs).filter((key: string) => key.includes('image')).forEach((key: string) => {
        const container = refs[key]
        if (container && container.clientWidth > width) {
          width = container.clientWidth
        }
        if (container && container.clientHeight > height) {
          height = container.clientHeight
        }
      })
      if (width !== 0 && height !== 0) {
        dimensions.width = width
        dimensions.height = height
      }
    }

    onMounted(() => {
      state.refsLoaded = true
      window.addEventListener('resize', resizeHandler)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', resizeHandler)
    })

    const startImageSettings = async(key: string, annotation: any) => {
      const hasPreviousSettings = state.gridState[key] != null
      let gridCell: GridCellState

      if (hasPreviousSettings) {
        gridCell = state.gridState[key]!
      } else {
        gridCell = reactive({
          showOpticalImage: true,
          isActive: true,
        })
      }
      Vue.set(state.gridState, key, gridCell)
    }

    const getChannels = (dsId: string) => {
      const channels : any[] = []
      const annotations: any[] = []
      $store.state.channels.forEach((channel: any) => {
        const idx = (channel.annotations?.datasetIds || []).indexOf(dsId)
        channels.push(channel)

        if (idx !== -1) {
          annotations.push(channel.annotations.annotations[idx])
        } else if (channel.id && channel.annotations && Array.isArray(channel.annotations.annotations)) {
          annotations.push({ ...channel.annotations.annotations[0], isEmpty: true })
        }
      })
      return { annotations, channels }
    }

    const updateAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !props.annotations || props.annotations.length === 0 || annotationIdx === -1) {
        state.annotationData = {}
        state.gridState = {}
        state.firstLoaded = true
        return
      }

      const auxGrid = grid
      const selectedAnnotation = props.annotations[annotationIdx]
      const settingPromises = Object.keys(auxGrid).map((key) => {
        const item = auxGrid[key]
        let dsIndex = selectedAnnotation
          ? selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item) : -1
        const { annotations } = getChannels(item)
        state.singleAnnotationId[key] = dsIndex
        dsIndex = $store.state.mode === 'MULTI'
          ? annotations.findIndex((item: any) => !item.isEmpty) : dsIndex

        if (dsIndex !== -1) {
          const selectedIonAnnotation = $store.state.mode === 'MULTI'
            ? annotations[dsIndex] : selectedAnnotation.annotations[dsIndex]

          Vue.set(state.annotationData, key, selectedIonAnnotation)
          return startImageSettings(key, selectedIonAnnotation)
        } else {
          Vue.set(state.annotationData, key, null)
          Vue.set(state.gridState, key, null)
        }
      })

      Promise.all(settingPromises)
        .catch(console.error)
        .finally(() => {
          state.firstLoaded = true
          setTimeout(() => { resizeHandler() }, 500)
        })
    }

    const settings = computed(() => {
      if (props.settings.value) {
        return safeJsonParse(props.settings.value.snapshot)
      }
      return {}
    })

    // set images and annotation related items when selected annotation changes
    watch(() => props.selectedAnnotation, async(newValue) => {
      await updateAnnotationData(settings.value.grid, newValue)
    })

    // set images and annotation related items when selected annotation changes
    watch(() => props.mode, async(newValue) => {
      await updateAnnotationData(settings.value.grid, props.selectedAnnotation)
    })

    const toggleOpticalImage = (event: any, key: string) => {
      event.stopPropagation()
      const gridCell = state.gridState[key]
      if (gridCell != null) {
        gridCell.showOpticalImage = !gridCell.showOpticalImage
      }
    }

    const toggleMenuButtons = (event: any, key: string) => {
      event.stopPropagation()
      const gridCell = state.gridState[key]
      if (gridCell != null) {
        gridCell.isActive = !gridCell.isActive
      }
    }

    const formatMSM = (value: number) => {
      return value ? value.toFixed(3) : '-'
    }

    const formatFDR = (value: number) => {
      return value ? `${Math.round(value * 100)}%` : '-'
    }

    const removeLayer = (index: number) => {
      $store.commit('removeChannel', { index })
    }

    const addLayer = () => {
      const selectedAnnotationsLength = Object.keys($store.state.channels).length
      const nOfChannels = Object.keys(channels).length
      const channel = Object.keys(channels)[selectedAnnotationsLength % nOfChannels]

      $store.commit('addChannel', { id: undefined, settings: { channel, visible: true } })
    }

    const handleLayerColorChange = (channel: string, index: number) => {
      $store.commit('updateChannel', {
        ...$store.state.channels[index],
        index,
        settings: { channel: channel, visible: $store.state.channels[index].settings.visible },
      })
    }

    const toggleChannelVisibility = (index: number) => {
      $store.commit('updateChannel', {
        ...$store.state.channels[index],
        index,
        settings: {
          channel: $store.state.channels[index].settings.channel,
          visible: !$store.state.channels[index].settings.visible,
        },
      })
      Vue.nextTick()
      resizeHandler()
    }

    const annotationsLink = (datasetId: string, database?: string, fdrLevel?: number) => {
      const query = {
        database,
        fdrLevel,
        datasetIds: [datasetId],
      }
      // delete undefined so that filter do not replace the nulls and make the navigation back weird
      if (!database) {
        delete query.database
      }
      if (!fdrLevel) {
        delete query.fdrLevel
      }

      return {
        name: 'annotations',
        params: { dataset_id: datasetId },
        query: encodeParams(query),
      }
    }

    const renderDatasetName = (name: string = '-') => {
      return (
        <div class='ds-comparison-item-line'>
          <span class='dataset-comparison-grid-ds-name truncate'>{name}</span>
        </div>
      )
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      const key = `${row}-${col}`
      const gridCell = state.gridState[key]
      const dataset =
        props.datasets
          ? props.datasets.find((dataset: any) => dataset.id === settings.value.grid[`${row}-${col}`])
          : null
      const { annotations, channels } = getChannels(dataset?.id)
      const annData = state.annotationData[key]
      const isEmpty = $store.state.mode === 'MULTI' ? annotations.filter((item: any) => !item.isEmpty).length === 0
        : (!props.isLoading && annData === null && gridCell === null)
          || (!props.isLoading && props.selectedAnnotation === -1)
          || (props.selectedAnnotation >= props.annotations.length)
          || (state.singleAnnotationId[key] === -1)

      if (isEmpty) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden items-center justify-start'
            style={{ height: 200, width: 200 }}>
            {renderDatasetName(dataset?.name)}
            {
              !props.isLoading
              && <span>No data</span>
            }
            {
              props.isLoading
              && <div class='absolute'>
                <i
                  class="el-icon-loading"
                />
              </div>
            }
          </div>)
      }

      if (props.isNormalized && dataset && dataset.id
        && props.normalizationData[dataset.id] && props.normalizationData[dataset.id].error) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden relative'
            style={{ height: 200, width: 200 }}>
            {renderDatasetName(dataset?.name)}
            <div
              class="normalization-error-wrapper"
            >
              <i class="el-icon-error info-icon mr-2" />
              <p class="text-lg">
              There was an error on normalization!
              </p>
            </div>
          </div>
        )
      }

      return (
        <div key={col} class='dataset-comparison-grid-col overflow-hidden relative'
          style={{ height: 200, width: 200 }}>
          {renderDatasetName(dataset?.name)}
          <MainImageHeader
            class='dataset-comparison-grid-item-header dom-to-image-hidden'
            annotation={annData}
            slot="title"
            isActive={false}
            hideOptions={true}
            showOpticalImage={!!gridCell?.showOpticalImage}
            toggleOpticalImage={(e: any) => toggleOpticalImage(e, key)}
            hasOpticalImage={
              annData?.dataset?.opticalImages[0]?.url
              !== undefined}
            resetViewport={() => {}}
          />
          <div class="dataset-comparison-extra dom-to-image-hidden">
            <div class="dataset-comparison-msm-badge">
                MSM <b>{formatMSM(annData?.msmScore)}</b>
            </div>
            <div class="dataset-comparison-fdr-badge">
                FDR <b>{formatFDR(annData?.fdrLevel)}</b>
            </div>
            <Popover
              trigger="hover"
              placement="right"
            >
              <div slot="reference" class="dataset-comparison-link">
                <RouterLink
                  target='_blank'
                  to={annotationsLink(annData?.dataset?.id?.toString(),
                    annData?.databaseDetails?.id?.toString(),
                    annData?.databaseDetails?.fdrLevel)}>
                  <StatefulIcon className="h-6 w-6 pointer-events-none">
                    <ExternalWindowSvg/>
                  </StatefulIcon>
                </RouterLink>
              </div>
                Individual dataset annotation page.
            </Popover>
            <Button
              title="Ion image controls"
              class={`${gridCell?.isActive ? 'active' : ''} button-reset flex h-6 ml-1 channel-toggle`}
              onClick={(e: any) => toggleMenuButtons(e, key)}>
              <StatefulIcon class="h-6 w-6 pointer-events-none" active={gridCell?.isActive}>
                <MonitorSvg class='fill-blue-700'/>
              </StatefulIcon>
            </Button>
          </div>
          <div ref={`image-${row}-${col}`} class='ds-wrapper relative'>
            {
              props.isLoading
              && <div class='absolute'>
                <i
                  class="el-icon-loading"
                />
              </div>
            }
            {
              dataset
              && <SimpleIonImageViewer
                annotations={annotations.length > 0 && $store.state.mode === 'MULTI' ? annotations : [annData]}
                channels={channels}
                imageTitle={dataset.name}
                showChannels={gridCell?.isActive}
                isActive={$store.state.mode === 'MULTI'}
                dataset={dataset}
                height={dimensions.height}
                width={dimensions.width}
                scaleBarColor={props.scaleBarColor}
                lockedIntensityTemplate={props.lockedIntensityTemplate}
                globalLockedIntensities={props.globalLockedIntensities}
                scaleType={props.scaleType}
                onIntensitiesChange={(intensity: any) => { emit('intensitiesChange', intensity) }}
                onLockAllIntensities={() => { emit('lockAllIntensities') }}
                colormap={props.colormap}
                isNormalized={props.isNormalized}
                normalizationData={props.normalizationData
                  ? props.normalizationData[annData?.dataset?.id] : null}
                showOpticalImage={!!gridCell?.showOpticalImage}
                resetViewPort={props.resetViewPort}
                onResetViewPort={() => { emit('resetViewPort', false) }}
                onRemoveLayer={removeLayer}
                onChangeLayer={handleLayerColorChange}
                onAddLayer={addLayer}
                onToggleVisibility={toggleChannelVisibility}
              />
            }
          </div>
        </div>
      )
    }

    return () => {
      return (
        <div class="dataset-comparison-grid">
          {
            range(props.nRows).map((row) => {
              return (
                <div key={row} class='dataset-comparison-grid-row'>
                  {
                    range(props.nCols).map((col) => {
                      return renderImageViewerHeaders(row, col)
                    })
                  }
                </div>
              )
            })
          }
        </div>
      )
    }
  },
})
