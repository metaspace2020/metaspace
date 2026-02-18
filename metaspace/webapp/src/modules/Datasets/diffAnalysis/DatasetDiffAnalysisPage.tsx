import { computed, defineComponent, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useQuery } from '@vue/apollo-composable'
import { FilterPanel } from '../../Filters/index'
import {
  getDatasetByIdQuery,
  GetDatasetByIdQuery,
  getRoisQuery,
  datasetListItemsWithDiagnosticsQuery,
  DatasetListItemWithDiagnostics,
} from '../../../api/dataset'
import { readNpy } from '../../../lib/npyHandler'
import safeJsonParse from '../../../lib/safeJsonParse'
import { cloneDeep, uniqBy } from 'lodash-es'

import { ElCollapse, ElCollapseItem, ElIcon, ElTooltip } from '../../../lib/element-plus'
import { Loading, QuestionFilled, ArrowLeft } from '@element-plus/icons-vue'
import { diffRoiResultsQuery } from '../../../api/dataset'
import { DatasetDiffTable } from './DatasetDiffTable'
import { DatasetDiffVolcanoPlot } from './DatasetDiffVolcanoPlot'
import { DatasetDiffHeatmap } from './DatasetDiffHeatmap'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import CopyButton from '../../../components/CopyButton.vue'
import { parseFormulaAndCharge } from '../../../lib/formulaParser'
import SimpleIonImageViewer from '../imzml/SimpleIonImageViewer'
import { userProfileQuery, UserProfileQuery } from '../../../api/user'
import { getActiveUserSubscriptionQuery } from '@/api/subscription'
import './DatasetDiffAnalysisPage.scss'

interface DatasetDiffAnalysisPageState {
  databaseOptions: any
  selectedAnnotation: any
  currentAnnotationIdx: number
  activeCollapseItem: 'volcano-plot' | 'heatmap' | null
  topNAnnotations: number | undefined
  savedRoiId: number | undefined
  isNormalized: boolean
  normalizationData: any
  lockedIntensities: [number | undefined, number | undefined]
}

export default defineComponent({
  name: 'DatasetDiffAnalysisPage',
  components: {
    FilterPanel,
    ElIcon,
    Loading,
  },
  props: {
    className: {
      type: String,
      default: 'dataset-diff',
    },
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const store = useStore()
    const state = reactive<DatasetDiffAnalysisPageState>({
      databaseOptions: undefined,
      selectedAnnotation: null,
      currentAnnotationIdx: -1,
      activeCollapseItem: undefined,
      topNAnnotations: undefined,
      savedRoiId: undefined,
      isNormalized: false,
      normalizationData: {},
      lockedIntensities: [undefined, undefined],
    })

    const datasetId = computed(() => route.params.dataset_id)
    const currentLevel = computed(() => 'dataset-diff-analysis')

    const { result: currentUserResult, loading: currentUserLoading } = useQuery<UserProfileQuery | any>(
      userProfileQuery,
      null,
      {
        fetchPolicy: 'cache-first',
      }
    )

    const currentUser = computed(() => (currentUserResult.value != null ? currentUserResult.value.currentUser : null))
    const { result: subscriptionResult } = useQuery<any>(getActiveUserSubscriptionQuery, null, {
      fetchPolicy: 'network-only',
    })
    const activeSubscription = computed(() => subscriptionResult.value?.activeUserSubscription)

    const { result: datasetResult, onResult: handleDatasetLoad } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, {
      id: datasetId.value,
    })
    const currentDataset = computed(() => datasetResult.value?.dataset)

    const { onResult: handleDatasetsLoad } = useQuery<{
      allDatasets: DatasetListItemWithDiagnostics[]
    }>(datasetListItemsWithDiagnosticsQuery, {
      dFilter: {
        ids: datasetId.value,
      },
    })

    const { onResult: handleRoisLoad } = useQuery<any>(getRoisQuery, {
      datasetId: datasetId.value,
      userId: currentUser.value?.id,
    })

    onMounted(() => {
      setTimeout(() => {
        handleCollapseChange(['volcano-plot'])
      }, 1000)
    })

    handleDatasetLoad(async () => {
      const filter = Object.assign({}, store.getters.filter)

      // Set datasetIds to current dataset for filtering context
      if (datasetId.value && (!filter.datasetIds || !filter.datasetIds.includes(datasetId.value))) {
        filter.datasetIds = [datasetId.value]
      }

      store.commit('updateFilter', filter)
    })

    handleDatasetsLoad(async (result) => {
      if (result && result.data && result.data.allDatasets) {
        let databases: any[] = []
        const normalizationData: any = {}

        for (let i = 0; i < result.data.allDatasets.length; i++) {
          const dataset: any = result.data.allDatasets[i]
          databases = databases.concat(dataset.databases)

          // Load TIC data for normalization
          try {
            const tics = dataset.diagnostics.filter((diagnostic: any) => diagnostic.type === 'TIC')
            if (tics.length > 0) {
              const tic = tics[0].images.filter((image: any) => image.key === 'TIC' && image.format === 'NPY')
              if (tic.length > 0) {
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
              }
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

        const databaseOptions = uniqBy(databases, 'id')
        const currentDatabaseId = store.getters?.gqlAnnotationFilter?.databaseId
        if (databaseOptions && databaseOptions.findIndex((db: any) => db.id === currentDatabaseId) === -1) {
          // set first database if default not selected
          const newFilter = Object.assign({}, store.getters.filter, { database: databaseOptions?.[0]?.id })
          store.commit('updateFilter', newFilter)
        }

        state.databaseOptions = databaseOptions
        state.normalizationData = normalizationData
      }
    })

    handleRoisLoad(async (result) => {
      if (result?.data?.rois) {
        const rois = result.data.rois.map((roi: any) => ({
          id: parseInt(roi.id),
          name: roi.name,
        }))
        // Set ROI options in the store's filterLists
        const currentFilterLists = store.state.filterLists || {}
        store.commit('setFilterLists', {
          ...currentFilterLists,
          rois: rois,
        })

        // Initialize ROI filter if not set
        const currentFilter = store.getters.filter
        if (!currentFilter.roiId && rois.length > 0) {
          const newFilter = { ...currentFilter, roiId: [rois[0].id] }
          store.commit('updateFilter', cloneDeep(newFilter))
        }

        // Store ROI display data for image viewer
        if (datasetId.value) {
          const roiDisplayData = result.data.rois.map((roi: any) => {
            const geojson = roi.geojson ? JSON.parse(roi.geojson) : null

            // Convert GeoJSON coordinates to the format expected by the renderer
            let coordinates: any[] = []
            if (
              geojson &&
              geojson.geometry &&
              geojson.geometry.coordinates &&
              geojson.geometry.coordinates.length > 0
            ) {
              // Handle different GeoJSON geometry types
              if (geojson.geometry.type === 'Polygon' && geojson.geometry.coordinates[0]) {
                coordinates = geojson.geometry.coordinates[0].map((coord: number[]) => ({
                  x: coord[0],
                  y: coord[1],
                  isEndPoint: false,
                }))
                // Mark the last point as end point to close the polygon
                if (coordinates.length > 0) {
                  coordinates[coordinates.length - 1].isEndPoint = true
                }
              }
            }

            return {
              id: parseInt(roi.id),
              name: roi.name,
              coordinates: coordinates,
              visible: true,
              strokeColor: geojson?.properties?.stroke,
              color: geojson?.properties?.color,
              rgb: geojson?.properties?.rgb,
              isDrawing: false,
              allVisible: true,
            }
          })
          store.commit('setRoiInfo', { key: datasetId.value, roi: roiDisplayData })
        }
      }
    })

    const { result: diffRoiResult } = useQuery<any>(diffRoiResultsQuery, {
      datasetId: datasetId.value,
      filter: computed(() => ({ ...store.getters.gqlRoiFilter, topNAnnotations: state.topNAnnotations })),
      annotationFilter: computed(() => store.getters.gqlAnnotationFilter),
    })
    const diffData = computed(() => diffRoiResult.value?.diffRoiResults)

    // const dataset = computed(() => (datasetResult.value != null ? datasetResult.value.dataset : null))

    const fixedOptions = computed(() => {
      // Only include database options in fixedOptions - ROI options are handled differently
      return state.databaseOptions ? { database: state.databaseOptions } : undefined
    })

    const handleRowChange = (idx: number, row: any) => {
      if (idx !== -1) {
        state.currentAnnotationIdx = idx
        state.selectedAnnotation = row
      }
    }

    const handleNormalizationChange = (isNormalized: boolean) => {
      state.isNormalized = isNormalized
    }

    const handleIntensityLockChange = (lockedIntensities: [number | undefined, number | undefined]) => {
      state.lockedIntensities = lockedIntensities
    }

    const roiInfo = computed(() => {
      if (datasetId.value && store.state.roiInfo && store.state.roiInfo[datasetId.value as string]) {
        const rois = store.state.roiInfo[datasetId.value as string] || []
        return rois
      }
      return []
    })

    const handleCollapseChange = (activeNames: string[]) => {
      // Determine which visualization is active (volcano-plot or heatmap)
      let newActiveItem: 'volcano-plot' | 'heatmap' | null = null
      if (activeNames.includes('volcano-plot') && !activeNames.includes('heatmap')) {
        newActiveItem = 'volcano-plot'
      } else if (activeNames.includes('heatmap') && !activeNames.includes('volcano-plot')) {
        newActiveItem = 'heatmap'
      } else if (activeNames.includes('volcano-plot') && activeNames.includes('heatmap')) {
        // If both are active, prioritize the one that wasn't previously active
        newActiveItem = state.activeCollapseItem === 'volcano-plot' ? 'heatmap' : 'volcano-plot'
      }

      if (newActiveItem !== state.activeCollapseItem) {
        state.activeCollapseItem = newActiveItem

        // Update ROI filter based on active collapse item
        const currentFilter = store.getters.filter
        const newFilter = { ...currentFilter }

        if (newActiveItem === 'volcano-plot') {
          // Set first ROI as default for LogFC x AUC plot
          const rois = store.state.filterLists?.rois
          if (rois && rois.length > 0) {
            const roiId = currentFilter.roiId || state.savedRoiId || rois[0].id
            newFilter.roiId = [roiId]
          }
          state.topNAnnotations = undefined
        } else if (newActiveItem === 'heatmap') {
          // Set 'any' (no ROI filter) as default for heatmap
          state.savedRoiId = currentFilter.roiId
          newFilter.roiId = undefined
          state.topNAnnotations = 5
        }

        store.commit('updateFilter', cloneDeep(newFilter))
      }
    }

    const handleBackClick = () => {
      router.push({
        name: 'dataset-annotations',
        params: { dataset_id: datasetId.value },
        query: {
          ds: datasetId.value,
          db_id: store.getters.gqlAnnotationFilter?.databaseId,
        },
      })
    }

    const renderRoiTableWrapper = () => {
      return (
        <div class="diff-table-wrapper w-full md:w-6/12">
          {diffData.value && (
            <DatasetDiffTable
              data={diffData.value}
              currentAnnotation={state.selectedAnnotation}
              isLoading={!diffData.value}
              onRowChange={handleRowChange}
            />
          )}
        </div>
      )
    }

    const renderRoiLegend = () => {
      if (!roiInfo.value || roiInfo.value.length === 0) {
        return null
      }

      return (
        <div class="roi-legend mt-3 w-full">
          <div class="flex flex-wrap gap-2 w-full justify-center items-center">
            {roiInfo.value.map((roi: any) => (
              <div key={roi.id} class="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                <div
                  class="w-3 h-3 rounded border border-gray-300"
                  style={{
                    backgroundColor: roi.color || roi.strokeColor || '#666666',
                  }}
                ></div>
                <span class="text-gray-700">{roi.name}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    const renderInfo = () => {
      if (!state.selectedAnnotation) {
        return null
      }

      const selectedAnnotation = state.selectedAnnotation.annotation

      // @ts-ignore TS2604
      const candidateMolecules = () => (
        <CandidateMoleculesPopover
          placement="bottom"
          possibleCompounds={selectedAnnotation.possibleCompounds}
          isomers={selectedAnnotation.isomers}
          isobars={selectedAnnotation.isobars}
        >
          <MolecularFormula class="sf-big text-2xl" ion={selectedAnnotation.ion} />
        </CandidateMoleculesPopover>
      )

      return (
        <div class="diff-main-header p-4 w-full border-b border-gray-200 bg-white">
          <div class="flex items-center justify-center">
            <div class="av-header-items">
              <div class="flex">
                {candidateMolecules()}
                <CopyButton class="ml-1" text={parseFormulaAndCharge(selectedAnnotation?.ion)}>
                  Copy ion to clipboard
                </CopyButton>
              </div>
              <span class="text-2xl flex items-baseline">
                {selectedAnnotation.mz.toFixed(4)}
                <span class="ml-1 text-gray-700 text-sm">m/z</span>
                <CopyButton class="self-start" text={selectedAnnotation.mz.toFixed(4)}>
                  Copy m/z to clipboard
                </CopyButton>
              </span>
            </div>
          </div>
          {renderRoiLegend()}
        </div>
      )
    }

    const renderImageViewer = () => {
      if (!state.selectedAnnotation) {
        return null
      }

      const selectedAnnotation = state.selectedAnnotation.annotation
      const ionImageUrl = selectedAnnotation?.isotopeImages?.[0]?.url

      return (
        <div class="image-viewer-wrapper w-full">
          {selectedAnnotation && ionImageUrl && (
            <SimpleIonImageViewer
              annotation={selectedAnnotation}
              ionImageUrl={ionImageUrl}
              pixelSizeX={selectedAnnotation.dataset?.acquisitionGeometry?.pixelSizeX || 1}
              pixelSizeY={selectedAnnotation.dataset?.acquisitionGeometry?.pixelSizeY || 1}
              isNormalized={state.isNormalized}
              normalizationData={state.normalizationData[selectedAnnotation.dataset?.id]} // @ts-ignore
              onNormalization={handleNormalizationChange}
              onIntensityLockChange={handleIntensityLockChange}
              lockedIntensities={state.lockedIntensities}
              roiInfo={roiInfo.value}
              maxHeight={400}
              renderAsCollapsible={true}
            />
          )}
          {(!selectedAnnotation || !ionImageUrl) && (
            <div class="flex items-center justify-center h-48 text-gray-500">
              No ion image available for this annotation
            </div>
          )}
        </div>
      )
    }

    const renderVolcanoPlot = () => {
      return (
        <ElCollapseItem
          name="volcano-plot"
          title="LogFC x AUC plot"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="flex items-center">
                LogFC x AUC plot
                <ElTooltip
                  popperClass="max-w-md text-sm text-justify"
                  content={
                    'Each dot represents an ion from the table (left), based on a ' +
                    'one-vs-all comparison for the selected ROI. The x-axis shows ' +
                    'log2 fold change (log2FC). The y-axis shows AUC ' +
                    '(0.5 = random; >0.5 = enriched in ROI; <0.5 = depleted). ' +
                    'Dots are colored by direction of log2FC (up/down). For best ' +
                    'interpretation, view one ROI at a time.'
                  }
                  placement="top"
                >
                  <ElIcon class="help-icon text-lg ml-1 cursor-pointer">
                    <QuestionFilled />
                  </ElIcon>
                </ElTooltip>
              </div>
            ),
            default: () => (
              <DatasetDiffVolcanoPlot
                data={diffData.value || []}
                isLoading={!diffData.value}
                selectedAnnotation={state.selectedAnnotation}
                onAnnotationSelected={(annotation: any) => {
                  const dataIndex = diffData.value?.findIndex((item: any) => item.annotation.id === annotation.id) ?? -1
                  if (dataIndex !== -1) {
                    handleRowChange(dataIndex, diffData.value[dataIndex])
                  }
                }}
              />
            ),
          }}
        />
      )
    }

    const renderHeatmap = () => {
      return (
        <ElCollapseItem
          name="heatmap"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="flex items-center">
                Heatmap
                <ElTooltip
                  popperClass="max-w-md text-sm text-justify"
                  content={
                    'Shows the top 5 ions across all ROIs, selected based ' +
                    'on AUC. Rows represent ions (listed in the table on the left), columns ' +
                    'represent ROIs. Both colors and cell labels correspond to log2 fold ' +
                    'change (log2FC). Use the interactive log2FC slider to adjust the threshold; ' +
                    'applying a minimum absolute AUC filter can further refine results. Selections ' +
                    'and filters are reflected in the table. Unlike the LogFC x AUC plot, this view ' +
                    'highlights top ions across all ROIs simultaneously.'
                  }
                  placement="top"
                >
                  <ElIcon class="help-icon text-lg ml-1 cursor-pointer">
                    <QuestionFilled />
                  </ElIcon>
                </ElTooltip>
              </div>
            ),
            default: () => (
              <DatasetDiffHeatmap
                data={diffData.value || []}
                isLoading={!diffData.value}
                selectedAnnotation={state.selectedAnnotation}
                isVisible={state.activeCollapseItem === 'heatmap'}
                onAnnotationSelected={(annotation: any, roiId: number) => {
                  const dataIndex =
                    diffData.value?.findIndex(
                      (item: any) => item.annotation.id === annotation.id && parseInt(item.roi.id, 10) === roiId
                    ) ?? -1
                  if (dataIndex !== -1) {
                    handleRowChange(dataIndex, diffData.value[dataIndex])
                  }
                }}
              />
            ),
          }}
        />
      )
    }

    const renderAnnotationInfoWrapper = () => {
      if (!state.selectedAnnotation) {
        return <div class="diff-info-wrapper w-full md:w-6/12" />
      }

      const activeNames = ['image-viewer'] // Always show image viewer
      if (state.activeCollapseItem === 'volcano-plot') activeNames.push('volcano-plot')
      if (state.activeCollapseItem === 'heatmap') activeNames.push('heatmap')

      return (
        <div class="diff-info-wrapper w-full md:w-6/12">
          {renderInfo()}
          <ElCollapse
            modelValue={[...activeNames]}
            class="annotation-info-collapse"
            id="annot-content"
            onChange={handleCollapseChange}
          >
            {renderImageViewer()}
            {renderVolcanoPlot()}
            {renderHeatmap()}
          </ElCollapse>
        </div>
      )
    }

    return () => {
      const isPro = activeSubscription.value?.isActive
      const isAdmin = currentUser.value?.role?.includes('admin')

      if (!isAdmin && (!currentUser.value?.id || !isPro)) {
        return (
          <div class="dataset-diff-page">
            <div class="flex w-full flex-wrap flex-row items-center justify-center">
              {currentUserLoading.value && (
                <div class="flex items-center justify-center h-48 text-gray-500">
                  <ElIcon class="is-loading">
                    <Loading />
                  </ElIcon>
                </div>
              )}
              {!currentUserLoading.value && (
                <div class="flex items-center justify-center h-48 text-gray-500">
                  Please upgrade to METASPACE Pro to view this page
                </div>
              )}
            </div>
          </div>
        )
      }

      return (
        <div class="dataset-diff-page">
          <div class={`${state.databaseOptions ? 'visible' : 'invisible'} min-h-[50px]`}>
            {state.databaseOptions && (
              <FilterPanel class="w-full" level={currentLevel.value} fixedOptions={fixedOptions.value} />
            )}
            <div
              onClick={handleBackClick}
              class="flex items-center text-blue-600 hover:text-blue-800 underline cursor-pointer mt-2 mb-1"
            >
              <ElIcon>
                <ArrowLeft />
              </ElIcon>
              Back to {currentDataset.value?.name} annotations
            </div>
          </div>

          <div class="flex w-full flex-wrap flex-row">
            {renderRoiTableWrapper()}
            {renderAnnotationInfoWrapper()}
          </div>
        </div>
      )
    }
  },
})
