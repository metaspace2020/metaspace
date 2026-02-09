import { computed, defineComponent, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
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
import { cloneDeep, uniqBy } from 'lodash-es'

import { ElCollapse, ElCollapseItem, ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import { diffRoiResultsQuery } from '../../../api/dataset'
import { DatasetDiffTable } from './DatasetDiffTable'
import { DatasetDiffVolcanoPlot } from './DatasetDiffVolcanoPlot'
import { DatasetDiffHeatmap } from './DatasetDiffHeatmap'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import './DatasetDiffAnalysisPage.scss'
import CopyButton from '../../../components/CopyButton.vue'
import { parseFormulaAndCharge } from '../../../lib/formulaParser'

interface DatasetDiffAnalysisPageState {
  databaseOptions: any
  selectedAnnotation: any
  currentAnnotationIdx: number
  activeCollapseItem: 'volcano-plot' | 'heatmap' | null
  topNAnnotations: number | undefined
  savedRoiId: number | undefined
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
    const store = useStore()
    const state = reactive<DatasetDiffAnalysisPageState>({
      databaseOptions: undefined,
      selectedAnnotation: null,
      currentAnnotationIdx: -1,
      activeCollapseItem: undefined,
      topNAnnotations: undefined,
      savedRoiId: undefined,
    })

    const datasetId = computed(() => route.params.dataset_id)
    const currentLevel = computed(() => 'dataset-diff-analysis')

    const { onResult: handleDatasetLoad } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, {
      id: datasetId.value,
    })

    const { onResult: handleDatasetsLoad } = useQuery<{
      allDatasets: DatasetListItemWithDiagnostics[]
    }>(datasetListItemsWithDiagnosticsQuery, {
      dFilter: {
        ids: datasetId.value,
      },
    })

    const { onResult: handleRoisLoad } = useQuery<any>(getRoisQuery, {
      datasetId: datasetId.value,
      userId: null, // Get all ROIs for the dataset
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

        for (let i = 0; i < result.data.allDatasets.length; i++) {
          const dataset: any = result.data.allDatasets[i]
          databases = databases.concat(dataset.databases)
        }

        const databaseOptions = uniqBy(databases, 'id')
        const currentDatabaseId = store.getters?.gqlAnnotationFilter?.databaseId
        if (databaseOptions && databaseOptions.findIndex((db: any) => db.id === currentDatabaseId) === -1) {
          // set first database if default not selected
          const newFilter = Object.assign({}, store.getters.filter, { database: databaseOptions?.[0]?.id })
          store.commit('updateFilter', newFilter)
        }

        state.databaseOptions = databaseOptions
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

    const handleCollapseChange = (activeNames: string[]) => {
      const newActiveItem = activeNames.includes('volcano-plot')
        ? 'volcano-plot'
        : activeNames.includes('heatmap')
        ? 'heatmap'
        : null

      if (newActiveItem !== state.activeCollapseItem) {
        state.activeCollapseItem = newActiveItem

        // Update ROI filter based on active collapse item
        const currentFilter = store.getters.filter
        const newFilter = { ...currentFilter }

        if (newActiveItem === 'volcano-plot') {
          // Set first ROI as default for volcano plot
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

    const renderInfo = () => {
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
        <div class="flex items-center justify-center p-2 w-full min-h-[50px]">
          {selectedAnnotation !== null && candidateMolecules()}
          {selectedAnnotation !== null && (
            <CopyButton class="ml-1" text={parseFormulaAndCharge(selectedAnnotation?.ion)}>
              Copy ion to clipboard
            </CopyButton>
          )}
          <span class="text-2xl flex items-baseline ml-4">
            {selectedAnnotation && selectedAnnotation.mz ? selectedAnnotation.mz.toFixed(4) : '-'}
            <span class="ml-1 text-gray-700 text-sm">m/z</span>
            <CopyButton
              class="self-start"
              text={selectedAnnotation && selectedAnnotation.mz ? selectedAnnotation.mz.toFixed(4) : '-'}
            >
              Copy m/z to clipboard
            </CopyButton>
          </span>
        </div>
      )
    }

    const renderVolcanoPlot = () => {
      const activeNames = state.activeCollapseItem === 'volcano-plot' ? ['volcano-plot'] : []

      return (
        <ElCollapse modelValue={activeNames} class="volcano-plot-collapse" onChange={handleCollapseChange}>
          <ElCollapseItem
            id="volcano-plot-collapse"
            name="volcano-plot"
            title="Volcano plot"
            class="ds-collapse el-collapse-item--no-padding relative"
          >
            <DatasetDiffVolcanoPlot
              data={diffData.value || []}
              isLoading={!diffData.value}
              selectedAnnotation={state.selectedAnnotation}
              onAnnotationSelected={(annotation: any) => {
                const rowIndex = diffData.value?.findIndex((item: any) => item.annotation.id === annotation.id) ?? -1
                if (rowIndex !== -1) {
                  handleRowChange(rowIndex, diffData.value[rowIndex])
                }
              }}
            />
          </ElCollapseItem>
        </ElCollapse>
      )
    }

    const renderHeatmap = () => {
      const activeNames = state.activeCollapseItem === 'heatmap' ? ['heatmap'] : []

      return (
        <ElCollapse modelValue={activeNames} class="heatmap-collapse" onChange={handleCollapseChange}>
          <ElCollapseItem
            id="heatmap-collapse"
            name="heatmap"
            title="Heatmap"
            class="ds-collapse el-collapse-item--no-padding relative"
          >
            <DatasetDiffHeatmap
              data={diffData.value || []}
              isLoading={!diffData.value}
              selectedAnnotation={state.selectedAnnotation}
              isVisible={state.activeCollapseItem === 'heatmap'}
              onAnnotationSelected={(annotation: any) => {
                const rowIndex = diffData.value?.findIndex((item: any) => item.annotation.id === annotation.id) ?? -1
                if (rowIndex !== -1) {
                  handleRowChange(rowIndex, diffData.value[rowIndex])
                }
              }}
            />
          </ElCollapseItem>
        </ElCollapse>
      )
    }

    const renderAnnotationInfoWrapper = () => {
      if (!state.selectedAnnotation) {
        return <div class="diff-info-wrapper w-full md:w-6/12" />
      }
      return (
        <div class="diff-info-wrapper w-full md:w-6/12">
          {renderInfo()}
          {renderVolcanoPlot()}
          {renderHeatmap()}
        </div>
      )
    }

    return () => {
      return (
        <div class="dataset-diff-page">
          <div class={`${state.databaseOptions ? 'visible' : 'invisible'} min-h-[50px] mb-4`}>
            {state.databaseOptions && (
              <FilterPanel class="w-full" level={currentLevel.value} fixedOptions={fixedOptions.value} />
            )}
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
