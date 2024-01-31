import { Button, Collapse, CollapseItem, Popover } from '../../../lib/element-ui'
import {
  computed,
  defineComponent,
  onMounted,
  reactive,
  ref,
  watchEffect,
} from '@vue/composition-api'
import { useQuery } from '@vue/apollo-composable'
import { annotationListQuery } from '../../../api/annotation'
import safeJsonParse from '../../../lib/safeJsonParse'
import RelatedMolecules from '../../Annotations/annotation-widgets/RelatedMolecules.vue'
import ImageSaver from '../../ImageViewer/ImageSaver.vue'
import { DatasetComparisonAnnotationTable } from './DatasetComparisonAnnotationTable'
import { DatasetComparisonGrid } from './DatasetComparisonGrid'
import gql from 'graphql-tag'
import FilterPanel from '../../Filters/FilterPanel.vue'
import config from '../../../lib/config'
import {
  DatasetListItemWithDiagnostics,
  datasetListItemsWithDiagnosticsQuery,
} from '../../../api/dataset'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import CopyButton from '../../../components/CopyButton.vue'
import { DatasetComparisonShareLink } from './DatasetComparisonShareLink'
import { groupBy, isEqual, uniqBy, uniq, omit } from 'lodash-es'
import { readNpy } from '../../../lib/npyHandler'
import { DatasetComparisonModeButton } from './DatasetComparisonModeButton'
import './DatasetComparisonPage.scss'
import { getIonImage, loadPngFromUrl } from '../../../lib/ionImageRendering'
import formatCsvRow, { csvExportIntensityHeader } from '../../../lib/formatCsvRow'
import FileSaver from 'file-saver'
import FilterIcon from '../../../assets/inline/filter.svg'
import { ANNOTATION_SPECIFIC_FILTERS } from '../../Filters/filterSpecs'
import { parseFormulaAndCharge } from '../../../lib/formulaParser'

interface GlobalImageSettings {
  resetViewPort: boolean
  isNormalized: boolean
  scaleBarColor: string
  scaleType: string
  colormap: string
  selectedLockTemplate: string | null
  globalLockedIntensities: [number | undefined, number | undefined]
  showOpticalImage: boolean
}

interface DatasetComparisonPageProps {
  className: string
  defaultImagePosition: any
}

interface DatasetComparisonPageState {
  currentAnnotationIdx: number
  gridState: any
  annotations: any
  datasets: any
  globalImageSettings: GlobalImageSettings
  grid: any
  nCols: number
  nRows: number
  annotationData: any
  colocDsId: any
  refsLoaded: boolean
  showViewer: boolean
  loadedSnapshot: boolean
  tableFullScreen: boolean
  isExporting: boolean
  exportProgress: number
  isLoading: any
  collapse: string[]
  databaseOptions: any
  normalizationData: any
  offset: number
  rawAnnotations: any
  processedAnnotations: any
  channelSnapshot: any
  coloc: boolean
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

const CHUNK_SIZE = 1000

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
    const fetchImageViewerSnapshot = gql`query fetchImageViewerSnapshot($id: String!, $datasetId: String!) {
      imageViewerSnapshot(id: $id, datasetId: $datasetId) {
        snapshot
      }
    }`
    const { $route, $store } = root
    const gridNode = ref(null)
    const imageGrid = ref(null)
    const state = reactive<DatasetComparisonPageState>({
      currentAnnotationIdx: -1,
      gridState: {},
      channelSnapshot: [],
      loadedSnapshot: false,
      tableFullScreen: false,
      isExporting: false,
      exportProgress: 0,
      databaseOptions: undefined,
      colocDsId: undefined,
      globalImageSettings: {
        resetViewPort: false,
        isNormalized: false,
        scaleBarColor: '#000000',
        scaleType: 'linear',
        colormap: 'Viridis',
        showOpticalImage: false,
        selectedLockTemplate: null,
        globalLockedIntensities: [undefined, undefined],
      },
      annotations: undefined,
      datasets: [],
      collapse: ['images'],
      grid: undefined,
      nCols: 0,
      nRows: 0,
      annotationData: {},
      refsLoaded: false,
      showViewer: false,
      isLoading: false,
      coloc: false,
      normalizationData: {},
      offset: 0,
      rawAnnotations: [],
      processedAnnotations: [],
    })
    const { dataset_id: sourceDsId } = $route.params
    const { viewId: snapshotId } = $route.query
    const {
      result: settingsResult,
    } = useQuery<any>(fetchImageViewerSnapshot, {
      id: snapshotId,
      datasetId: sourceDsId,
    })

    const gridSettings = computed(() => settingsResult.value != null
      ? settingsResult.value.imageViewerSnapshot : null)

    const queryVariables = () => {
      const filter = $store.getters.gqlAnnotationFilter
      const dFilter = $store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = state.coloc
        ? {
          colocalizedWith: filter.colocalizedWith,
          colocalizationAlgo: null,
          databaseId: filter.databaseId,
          fdrLevel: filter.fdrLevel,
        } : undefined
      const query = $store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        countIsomerCompounds: config.features.isomers,
      }
    }

    const annotationQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })
    const colocAnnotationQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })
    const dsQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })
    const annotationQueryVars = computed(() => ({
      ...queryVariables(),
      dFilter: { ...queryVariables().dFilter, ids: Object.values(state.grid || {}).join('|') },
      limit: CHUNK_SIZE,
      offset: state.offset,
    }))
    const colocAnnotationQueryVars = computed(() => ({
      ...queryVariables(),
      dFilter: { ...queryVariables().dFilter, ids: state.colocDsId },
      limit: CHUNK_SIZE,
      offset: state.offset,
    }))

    const {
      loading: annotationsLoading,
      onResult: onAllAnnotationsResult,
    } = useQuery<any>(annotationListQuery, annotationQueryVars, annotationQueryOptions)

    const aggregateAnnotations = () => {
      const annotationsByIon = groupBy(state.rawAnnotations, 'ion')
      const processedAnnotations = Object.keys(annotationsByIon).map((ion: string) => {
        const annotations = annotationsByIon[ion]
        const dbId = annotations[0].databaseDetails.id
        const datasetIds = uniq(annotations.map((annotation: any) => annotation.dataset.id))

        return {
          ion,
          dbId,
          datasetIds,
          annotations,
        }
      })

      state.annotations = processedAnnotations
      dsQueryOptions.enabled = true

      if (!state.loadedSnapshot) {
        const auxSettings = safeJsonParse(gridSettings.value.snapshot)
        if (auxSettings.mode === 'MULTI') {
          loadSnapshotChannels(auxSettings.channels)
        }
        state.loadedSnapshot = true
      }
    }

    onAllAnnotationsResult(async(result) => {
      let rawAnnotations = state.rawAnnotations
      if (result && result.data) {
        if (state.offset === 0) {
          rawAnnotations = []
        }
        rawAnnotations = rawAnnotations.concat(result.data.allAnnotations)

        state.rawAnnotations = rawAnnotations
        if (state.offset < result.data.countAnnotations) {
          state.offset += CHUNK_SIZE
        } else {
          annotationQueryOptions.enabled = false
          state.offset = 0
          aggregateAnnotations()
        }
      }
    })

    const {
      loading: colocAnnotationsLoading,
      onResult: oncolocAllAnnotationsResult,
    } = useQuery<any>(annotationListQuery, colocAnnotationQueryVars, colocAnnotationQueryOptions)

    oncolocAllAnnotationsResult(async(result) => {
      let rawAnnotations = state.rawAnnotations
      if (result && result.data) {
        if (state.offset === 0 && datasetIds.value.indexOf(state.colocDsId) === 0) {
          rawAnnotations = []
        }
        rawAnnotations = rawAnnotations.concat(result.data.allAnnotations)

        state.rawAnnotations = rawAnnotations
        if (state.offset < result.data.countAnnotations) {
          state.offset += CHUNK_SIZE
        } else if (datasetIds.value.indexOf(state.colocDsId) !== datasetIds.value.length - 1) {
          state.colocDsId = datasetIds.value[datasetIds.value.indexOf(state.colocDsId) + 1]
          state.offset = 0
        } else {
          colocAnnotationQueryOptions.enabled = false
          state.offset = 0
          aggregateAnnotations()
        }
      }
    })

    const {
      result: datasetsResult,
      onResult: onDatasetsResult,
    } = useQuery<{allDatasets: DatasetListItemWithDiagnostics[]}>(datasetListItemsWithDiagnosticsQuery,
      () => ({
        dFilter: {
          ...queryVariables().dFilter,
          ids:
            gridSettings.value ? Object.values((safeJsonParse(gridSettings.value.snapshot) || {}).grid || {})
              .join('|') : '',
        },
      }), dsQueryOptions)

    onDatasetsResult(async(result) => {
      const normalizationData : any = {}
      // calculate normalization
      if (result && result.data && result.data.allDatasets) {
        let databases : any[] = []

        for (let i = 0; i < result.data.allDatasets.length; i++) {
          const dataset : any = result.data.allDatasets[i]

          databases = databases.concat(dataset.databases)

          try {
            const tics = dataset.diagnostics.filter((diagnostic : any) => diagnostic.type === 'TIC')
            const tic = tics[0].images.filter((image: any) => image.key === 'TIC' && image.format === 'NPY')
            const { data, shape } = await readNpy(tic[0].url)
            const metadata = safeJsonParse(tics[0].data)
            metadata.maxTic = metadata.max_tic
            metadata.minTic = metadata.min_tic
            delete metadata.max_tic
            delete metadata.min_tic

            normalizationData[dataset.id] = {
              data,
              shape,
              metadata: metadata,
              type: 'TIC',
              showFullTIC: false,
              error: false,
            }
          } catch (e) {
            normalizationData[dataset.id] = {
              data: null,
              shape: null,
              metadata: null,
              showFullTIC: null,
              type: 'TIC',
              error: true,
            }
          }
        }

        state.databaseOptions = { database: uniqBy(databases, 'id') }
      }
      state.normalizationData = normalizationData
    })

    const loadAnnotations = () => { annotationQueryOptions.enabled = true }
    const datasets = computed(() => {
      if (datasetsResult.value) {
        return datasetsResult.value.allDatasets
      }
      return null
    })
    const datasetIds = computed(() => Object.values((safeJsonParse(gridSettings.value.snapshot) || {}).grid
      || {}))

    const requestAnnotations = async() => {
      state.isLoading = true
      loadAnnotations()
      state.isLoading = false
    }

    onMounted(() => {
      state.refsLoaded = true
      $store.commit('resetChannels')
      $store.commit('setViewerMode', 'SINGLE')

      // add listener to query annotations again in case the filters change
      $store.watch((_, getters) => [getters.gqlAnnotationFilter,
        $store.getters.gqlDatasetFilter, $store.getters.gqlColocalizationFilter, $store.getters.ftsQuery],
      (filter, previousFilter) => {
        if (filter[0].colocalizedWith) {
          if (!state.coloc || filter[0].colocalizedWith !== previousFilter[0].colocalizedWith) {
            colocAnnotationQueryOptions.enabled = true
            annotationQueryOptions.enabled = false
          }
          state.coloc = true
        } else {
          state.coloc = false
        }

        if (state.annotations && !isEqual(filter, previousFilter)) {
          state.offset = 0
          if (state.coloc) {
            colocAnnotationQueryOptions.enabled = true
            state.colocDsId = datasetIds.value[0]
            annotationQueryOptions.enabled = false
          } else {
            colocAnnotationQueryOptions.enabled = false
            annotationQueryOptions.enabled = true
          }
        }
      })
    })

    const loadSnapshotChannels = (snapshotChannels: any) => {
      const annotations = state.annotations
      $store.commit('setViewerMode', 'MULTI')

      snapshotChannels.forEach((channel: any, index: number) => {
        const { id, settings } = channel
        const annotationItem = annotations.find((annotation: any) => annotation.ion === id)
        $store.commit('addChannel', {
          index,
          id,
          annotations: annotationItem,
          settings: { ...settings, visible: true },
        })
        if (!settings.visible) { // toggle visibility later, as the first intensity must be loaded
          setTimeout(() => {
            $store.commit('updateChannel', { index, id, annotations: annotationItem, settings })
          }, 1000)
        }
      })
    }

    watchEffect(async() => {
      if (!state.grid && gridSettings.value) {
        const auxSettings = safeJsonParse(gridSettings.value.snapshot)
        state.nCols = auxSettings.nCols
        state.nRows = auxSettings.nRows
        state.grid = auxSettings.grid

        if (auxSettings.filter) {
          const filter = Object.assign({}, auxSettings.filter)
          $store.commit('updateFilter', filter)
        }

        if (auxSettings.colormap) {
          handleColormapChange(auxSettings.colormap)
        } else if ($route.query.cmap) {
          handleColormapChange($route.query.cmap)
        }

        if (auxSettings.norm) {
          handleNormalizationChange(true)
        } else if ($route.query.norm) {
          handleNormalizationChange(true)
        }

        if (auxSettings.scaleType) {
          handleScaleTypeChange(auxSettings.scaleType)
        } else if ($route.query.scale) {
          handleScaleTypeChange($route.query.scale)
        }

        handleScaleBarColorChange(auxSettings.scaleBarColor)
        if (auxSettings.lockedIntensityTemplate) {
          handleTemplateChange(auxSettings.lockedIntensityTemplate)
        } else if (
          Array.isArray(auxSettings.globalLockedIntensities)
          && auxSettings.globalLockedIntensities.length === 2) {
          const intensities : [number | undefined, number | undefined] = [
            auxSettings.globalLockedIntensities[0] === null ? undefined : auxSettings.globalLockedIntensities[0],
            auxSettings.globalLockedIntensities[1] === null ? undefined : auxSettings.globalLockedIntensities[1],
          ]
          handleIntensitiesChange(intensities)
        }

        await requestAnnotations()

        // sets lock template after grid mounted
        if ($store.getters.settings.annotationView.lockTemplate) {
          handleTemplateChange($store.getters.settings.annotationView.lockTemplate)
        }
      }
    })

    const resetViewPort = (event: any) => {
      if (event) {
        event.stopPropagation()
      }
      state.globalImageSettings.resetViewPort = !state.globalImageSettings.resetViewPort
    }

    const handleScaleBarColorChange = (scaleBarColor: string) => {
      state.globalImageSettings.scaleBarColor = scaleBarColor
    }

    const handleScaleTypeChange = (scaleType: string) => {
      state.globalImageSettings.scaleType = scaleType
    }

    const handleColormapChange = (colormap: string) => {
      state.globalImageSettings.colormap = colormap
    }

    const handleNormalizationChange = (isNormalized: boolean) => {
      state.globalImageSettings.isNormalized = isNormalized
    }

    const handleTemplateChange = (dsId: string) => {
      state.globalImageSettings.selectedLockTemplate = dsId
      $store.commit('setLockTemplate', dsId)
    }

    const filterColocalized = () => {
      const { annotations, currentAnnotationIdx } = state
      const selectedAnnotation = annotations && annotations[currentAnnotationIdx]
      state.coloc = true

      $store.commit('updateFilter', {
        ...omit($store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
        colocalizedWith: selectedAnnotation?.ion,
      })
      $store.commit('setSortOrder', {
        by: 'colocalization',
        dir: 'descending',
      })
    }

    const handleIntensitiesChange = (intensities: [number | undefined, number | undefined]) => {
      state.globalImageSettings.globalLockedIntensities = intensities
    }

    const handleRowChange = (idx: number) => {
      if (idx !== -1) {
        state.isLoading = true
        state.currentAnnotationIdx = idx
        handleChannelHighlight()
        setTimeout(() => {
          state.isLoading = false
        }, 500)
      }
    }

    const handleScreenChange = (isFullScreen: boolean) => {
      state.tableFullScreen = isFullScreen
    }

    const handleAbort = () => {
      state.isExporting = false
      state.exportProgress = 0
    }

    const startIntensitiesExport = async() => {
      async function formatIntensitiesRow(annotation: any, normalizationData: any) {
        const { isotopeImages, ionFormula: molFormula, possibleCompounds, adduct, mz, dataset } = annotation
        const isotopeImage = isotopeImages[0]
        const ionImagePng = await loadPngFromUrl(isotopeImage.url)
        const molName = possibleCompounds.map((m: any) => m.name).join(',')
        const molIds = possibleCompounds.map((m: any) => m.information[0].databaseId).join(',')
        const finalImage : any = getIonImage(ionImagePng, isotopeImages[0], undefined,
          undefined, normalizationData)
        const row = [molFormula, adduct, mz, `"${molName}"`, `"${molIds}"`]
        const { width, height, intensityValues } = finalImage
        const cols = ['mol_formula', 'adduct', 'mz', 'moleculeNames', 'moleculeIds']

        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            cols.push(`x${x}_y${y}`)
            const idx = y * width + x
            row.push(intensityValues[idx])
          }
        }

        return { cols, row, dsName: dataset.name }
      }

      let offset = 0
      state.isExporting = true
      const annotations = state.annotations.map((annotation: any) => annotation.annotations).flat()
      const totalCount = annotations?.length || 1
      const datasetIds : string[] = Object.values((safeJsonParse(gridSettings.value.snapshot) || {}).grid || {})
      const annotationsByDsId : any = groupBy(annotations, 'dataset.id')

      // generate one file per dataset
      for (let j : number = 0; j < datasetIds?.length; j++) {
        const datasetId : string = datasetIds[j]
        const currentAnnotations : any[] = annotationsByDsId[datasetId]
        let fileName : string = ''
        let rows = ''
        let fileCols

        for (let i : number = 0; i < currentAnnotations?.length; i++) {
          if (!state.isExporting) {
            state.exportProgress = 0
            return
          }
          const annotation : any = currentAnnotations[i]
          offset += 1
          state.exportProgress = offset / totalCount
          try {
            const { cols, row, dsName } = await formatIntensitiesRow(annotation,
              state.globalImageSettings.isNormalized
                ? state.normalizationData[annotation.dataset.id] : undefined)
            if (!fileCols) {
              fileCols = formatCsvRow(cols)
              fileName = `${dsName.replace(/\s/g, '_')}_pixel_intensities${state.globalImageSettings.isNormalized
                ? '_tic_normalized' : ''}.csv`
            }
            rows += formatCsvRow(row)
          } catch (e) {
            // pass when fail to convert png
          }
        }

        if (state.isExporting) {
          if (j === datasetIds?.length - 1) {
            state.isExporting = false
            state.exportProgress = 0
          }
          const csv = csvExportIntensityHeader(state.globalImageSettings.isNormalized) + fileCols + rows
          const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
          FileSaver.saveAs(blob, fileName)
        }
      }
    }

    const handleModeChange = (mode: string = 'SINGLE') => {
      $store.commit('setViewerMode', mode)
      if (mode === 'SINGLE') {
        state.channelSnapshot = $store.state.channels
        $store.commit('resetChannels')
      } else {
        $store.commit('restoreChannels', state.channelSnapshot)
      }
      handleChannelHighlight()
    }

    const handleChannelHighlight = () => {
      if ($store.state.mode !== 'MULTI' || !state.annotations) {
        return
      }

      const selectedAnnotationsLength = $store.state.channels.length
      const nOfChannels = Object.keys(channels).length
      const channel = Object.keys(channels)[selectedAnnotationsLength % nOfChannels]
      const annotations = state.annotations[state.currentAnnotationIdx]
      const id = annotations.ion
      const index = $store.state.channels.length - 1

      if ($store.state.channels.length === 0) {
        $store.commit('addChannel', { id, annotations, settings: { channel, visible: true } })
      } else if (!$store.state.channels.map((item: any) => item.id).includes(id)) {
        $store.commit('updateChannel', {
          index,
          id,
          annotations,
          settings: { channel: $store.state.channels[index].settings.channel, visible: true },
        })
      }
    }

    const handleCollapse = (activeNames: string[]) => {
      state.collapse = activeNames
    }

    const renderInfo = () => {
      const { annotations, currentAnnotationIdx, globalImageSettings, nCols, nRows } = state

      const selectedAnnotation = annotations && annotations[currentAnnotationIdx]
      && Array.isArray(annotations[currentAnnotationIdx].annotations)
        ? annotations[currentAnnotationIdx].annotations[0] : null
      let possibleCompounds : any = []
      let isomers : any = []
      let isobars : any = []

      annotations[currentAnnotationIdx].annotations.forEach((annotation: any) => {
        possibleCompounds = possibleCompounds.concat(annotation.possibleCompounds)
        isomers = isomers.concat(annotation.isomers)
        isobars = isobars.concat(annotation.isobars)
      })

      // @ts-ignore TS2604
      const candidateMolecules = (annotation: any) => <CandidateMoleculesPopover
        placement="bottom"
        possibleCompounds={uniqBy(possibleCompounds, 'name')}
        isomers={isomers}
        isobars={isobars}>
        <MolecularFormula
          class="sf-big text-2xl"
          ion={annotation.ion}
        />
      </CandidateMoleculesPopover>

      return (
        <div class='ds-comparison-info relative'>
          {
            selectedAnnotation !== null
            && candidateMolecules(selectedAnnotation)
          }
          {
            selectedAnnotation !== null
            && <CopyButton
              class="ml-1"
              text={parseFormulaAndCharge(selectedAnnotation?.ion)}>
                Copy ion to clipboard
            </CopyButton>
          }
          <span class="text-2xl flex items-baseline ml-4">
            { selectedAnnotation && selectedAnnotation.mz ? selectedAnnotation.mz.toFixed(4) : '-'}
            <span class="ml-1 text-gray-700 text-sm">m/z</span>
            <CopyButton
              class="self-start"
              text={selectedAnnotation && selectedAnnotation.mz ? selectedAnnotation.mz.toFixed(4) : '-'}>
              Copy m/z to clipboard
            </CopyButton>
          </span>
          <DatasetComparisonShareLink
            viewId={snapshotId}
            nCols={nCols}
            nRows={nRows}
            lockedIntensityTemplate={globalImageSettings.selectedLockTemplate}
            globalLockedIntensities={globalImageSettings.globalLockedIntensities}
            scaleBarColor={globalImageSettings.scaleBarColor}
            scaleType={globalImageSettings.scaleType}
            colormap={globalImageSettings.colormap}
            settings={gridSettings.value?.snapshot}
            selectedAnnotation={currentAnnotationIdx}
            sourceDsId={sourceDsId}
            name={$route.name}
            params={$route.params}
            query={$route.query}/>
          <DatasetComparisonModeButton
            class="absolute right-0 bottom-0 mr-5 mb-2"
            isActive={$store.state.mode === 'MULTI'}
            onMode={handleModeChange}
          />
        </div>
      )
    }

    const renderImageGallery = (nCols: number, nRows: number) => {
      const { annotations, collapse, currentAnnotationIdx, globalImageSettings, normalizationData, isLoading } = state
      return (
        <CollapseItem
          id="annot-img-collapse"
          name="images"
          class="ds-collapse el-collapse-item--no-padding relative">
          <MainImageHeader
            class='dataset-comparison-item-header dom-to-image-hidden'
            slot="title"
            isActive={false}
            scaleBarColor={globalImageSettings?.scaleBarColor}
            onScaleBarColorChange={handleScaleBarColorChange}
            scaleType={globalImageSettings?.scaleType}
            onScaleTypeChange={handleScaleTypeChange}
            showIntensityTemplate={true}
            showNormalizedBadge={collapse.includes('images') && globalImageSettings.isNormalized}
            onNormalizationChange={handleNormalizationChange}
            colormap={globalImageSettings?.colormap}
            onColormapChange={handleColormapChange}
            lockedTemplate={globalImageSettings.selectedLockTemplate}
            onTemplateChange={handleTemplateChange}
            showOpticalImage={false}
            hasOpticalImage={false}
            resetViewport={resetViewPort}
            toggleOpticalImage={() => {}}
            lockTemplateOptions={uniqBy(datasets.value, 'id')}
          />
          <ImageSaver
            class="absolute top-0 right-0 mt-2 mr-2 dom-to-image-hidden"
            domNode={gridNode.value}
            fileName={'datasets_comparison'}
          />
          <Popover
            trigger="hover"
            placement="bottom"
          >
            <div slot='reference' class='coloc-filter-wrapper dom-to-image-hidden'>
              <Button
                class="w-5 h-5 button-reset av-icon-button"
                title="Show in list"
                onClick={filterColocalized}
              >
                <FilterIcon class="w-5 h-5 fill-current"/>
              </Button>
            </div>
            <span>
              Filter by colocalized annotations
            </span>
          </Popover>
          <div class='dataset-comparison-grid' ref={gridNode}>
            {
              collapse.includes('images')
              && !(annotationsLoading.value || colocAnnotationsLoading.value)
              && <DatasetComparisonGrid
                ref={imageGrid}
                nCols={nCols}
                nRows={nRows}
                mode={$store.state.mode}
                resetViewPort={globalImageSettings.resetViewPort}
                onResetViewPort={resetViewPort}
                onLockAllIntensities={handleTemplateChange}
                onIntensitiesChange={handleIntensitiesChange}
                lockedIntensityTemplate={globalImageSettings.selectedLockTemplate}
                globalLockedIntensities={globalImageSettings.globalLockedIntensities}
                scaleBarColor={globalImageSettings.scaleBarColor}
                scaleType={globalImageSettings.scaleType}
                colormap={globalImageSettings.colormap}
                isNormalized={globalImageSettings.isNormalized}
                settings={gridSettings}
                annotations={annotations || []}
                normalizationData={normalizationData}
                datasets={datasets.value || []}
                selectedAnnotation={currentAnnotationIdx}
                isLoading={isLoading || annotationsLoading.value || colocAnnotationsLoading.value}
              />
            }
            {
              collapse.includes('images')
              && (annotationsLoading.value || colocAnnotationsLoading.value)
              && <div class='w-full text-center'>
                <i
                  class="el-icon-loading"
                />
              </div>
            }
          </div>
        </CollapseItem>)
    }

    const renderCompounds = () => {
      const { annotations, collapse, currentAnnotationIdx, isLoading } = state
      const selectedAnnotations = currentAnnotationIdx >= 0 && annotations[currentAnnotationIdx]
        ? annotations[currentAnnotationIdx].annotations : []

      // @ts-ignore TS2604
      const relatedMolecules = () => <RelatedMolecules
        query="isomers"
        annotation={selectedAnnotations[0]}
        annotations={selectedAnnotations}
        databaseId={$store.getters.filter.database || 1}
        hideFdr
      />

      return (<CollapseItem
        id="annot-img-collapse"
        name="compounds"
        title="Molecules"
        class="ds-collapse el-collapse-item--no-padding relative">
        {
          !isLoading
          && collapse.includes('compounds')
          && (Array.isArray(selectedAnnotations) && selectedAnnotations.length > 0)
          && relatedMolecules()
        }
        {
          !isLoading
          && collapse.includes('compounds')
          && (!Array.isArray(selectedAnnotations) || selectedAnnotations.length < 1)
          && <div class='flex w-full items-center justify-center'>No data</div>
        }
      </CollapseItem>)
    }

    const renderAnnotationTableWrapper = () => {
      const { annotations } = state
      return (
        <div class={`dataset-comparison-wrapper w-full ${state.tableFullScreen ? 'w-full' : 'md:w-6/12'} relative`}>
          {
            annotations
            && <DatasetComparisonAnnotationTable
              isLoading={annotationsLoading.value || colocAnnotationsLoading.value}
              annotations={annotations.map((ion: any) => {
                return {
                  ...ion.annotations[0],
                  isomersCount: ion.annotations[0].countPossibleCompounds,
                  isobarsCount: ion.annotations[0].isobars.length,
                  maxIntensity: Math.max(...ion.annotations.map((annot: any) => annot.isotopeImages[0].maxIntensity)),
                  msmScore: Math.max(...ion.annotations.map((annot: any) => annot.msmScore)),
                  colocalization: Math.max(...ion.annotations.map((annot: any) => annot.colocalizationCoeff)),
                  fdrlevel: Math.min(...ion.annotations.map((annot: any) => annot.fdrlevel)),
                  datasetcount: (ion.datasetIds || []).length,
                  rawAnnotations: ion.annotations,
                }
              })}
              coloc={state.coloc}
              exportProgress={state.exportProgress}
              isExporting={state.isExporting}
              onRowChange={handleRowChange}
              onScreen={handleScreenChange}
              onExport={startIntensitiesExport}
              onAbort={handleAbort}
            />
          }
          {
            !annotations
            && (annotationsLoading.value || colocAnnotationsLoading.value)
            && <div class='w-full absolute text-center top-0'>
              <i
                class="el-icon-loading"
              />
            </div>
          }
        </div>
      )
    }

    const renderAnnotationInfoWrapper = () => {
      const { nCols, nRows, collapse, currentAnnotationIdx, annotations } = state

      if (
        currentAnnotationIdx === undefined
        || currentAnnotationIdx === -1
        || !annotations[currentAnnotationIdx]) {
        return <div class='dataset-comparison-wrapper  w-full  md:w-6/12'/>
      }

      return (
        <div class='dataset-comparison-wrapper  w-full  md:w-6/12'>
          <Collapse
            value={collapse}
            id="annot-content"
            class="border-0"
            onChange={handleCollapse}>
            {renderInfo()}
            {renderImageGallery(nCols, nRows)}
            {renderCompounds()}
          </Collapse>
        </div>)
    }

    return () => {
      if (!snapshotId) {
        return (
          <div class='dataset-comparison-page w-full flex flex-wrap flex-row items-center justify-center'>
            Not found
          </div>)
      }

      return (
        <div class='dataset-comparison-page w-full flex flex-wrap flex-row'>
          <FilterPanel
            class='w-full'
            level='annotation'
            hiddenFilters={['datasetIds']}
            fixedOptions={state.databaseOptions}
          />
          {renderAnnotationTableWrapper()}
          {!state.tableFullScreen && renderAnnotationInfoWrapper()}
        </div>
      )
    }
  },
})
