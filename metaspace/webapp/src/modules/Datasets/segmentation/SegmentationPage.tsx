import { computed, defineComponent, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { FilterPanel } from '../../Filters/index'

import { ElIcon, ElButton, ElAlert, ElCollapse, ElCollapseItem, ElTag } from '../../../lib/element-plus'
import { Loading, ArrowLeft } from '@element-plus/icons-vue'
import './SegmentationPage.scss'
import {
  getDatasetByIdQuery,
  getDatasetDiagnosticsQuery,
  getSegmentationsQuery,
  opticalImagesQuery,
} from '@/api/dataset'
import { SegmentationVisualization } from './SegmentationVisualization'
import { SegmentationHeatmap } from './SegmentationHeatmap'
import { SegmentMarkers } from './SegmentMarkers'
import { SegmentationDiagnostics } from './SegmentationDiagnostics'
import AspectRatioIcon from '../../../assets/inline/material/aspect-ratio.svg'
import { MonitorSvg } from '@/design/refactoringUIIcons'
import StatefulIcon from '../../../components/StatefulIcon.vue'

export default defineComponent({
  name: 'DatasetSegmentationPage',
  components: {
    FilterPanel,
    ElIcon,
    ElButton,
    ElAlert,
    ElCollapse,
    ElCollapseItem,
    ElTag,
    Loading,
    SegmentationVisualization,
    SegmentationHeatmap,
    SegmentMarkers,
    SegmentationDiagnostics,
  },
  props: {
    className: {
      type: String,
      default: 'segmentation-page',
    },
  },
  setup() {
    const route = useRoute()
    const router = useRouter()

    const state = reactive({
      activeCollapseItems: ['segmentation-map'],
      showLegend: true,
      resetViewTrigger: 0,
      showSegmentMarkers: false,
      showOpticalImage: true,
    })

    const datasetId = computed(() => route.params.dataset_id)

    const { result: datasetResult } = useQuery<any>(getDatasetByIdQuery, {
      id: datasetId.value,
    })
    const currentDataset = computed(() => datasetResult.value?.dataset)

    const { result: segmentationsResult } = useQuery<any>(getSegmentationsQuery, {
      datasetId: datasetId.value,
    })
    const segmentations = computed(() => segmentationsResult.value?.segmentations)

    const {
      result: diagnosticDataResult,
      loading,
      error,
    } = useQuery<any>(getDatasetDiagnosticsQuery, {
      id: route.params.dataset_id,
    })

    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: datasetId.value,
    })

    const diagnosticData = computed(
      () =>
        diagnosticDataResult.value?.dataset?.diagnostics
          .filter((diagnostic: any) => diagnostic.type === 'SEGMENTATION')
          ?.at(0)
    )

    const opticalImage = computed(() => {
      return (opticalImagesResult.value as any)?.dataset?.opticalImages?.[0]
    })

    const segmentationData = computed(() => {
      if (!diagnosticData.value) return null
      try {
        return JSON.parse(diagnosticData.value.data)
      } catch (error) {
        console.error('Failed to parse segmentation data:', error)
        return null
      }
    })

    const goBack = () => {
      router.push(`/dataset/${datasetId.value}`)
    }

    const handleCollapseChange = (activeNames: string[]) => {
      state.activeCollapseItems = activeNames
      setTimeout(() => {
        state.showSegmentMarkers = activeNames.includes('segment-markers')
      }, 100)
    }

    const handleExportCSV = () => {
      // TODO: Implement CSV export
      console.log('Export CSV clicked')
    }

    const handleIonSelected = (ion: string) => {
      console.log('Ion selected:', ion)
    }

    const handleResetView = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.resetViewTrigger++
    }

    const handleToggleLegend = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.showLegend = !state.showLegend
    }

    const handleToggleOpticalImage = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.showOpticalImage = !state.showOpticalImage
    }

    const renderHeatmapWrapper = () => {
      if (!segmentationData.value) return null

      return (
        <div class="segmentation-heatmap-wrapper w-full md:w-6/12">
          <div class="heatmap-header">
            <h2 class="heatmap-title">Top segmentation results</h2>
          </div>
          <SegmentationHeatmap
            segmentationData={segmentationData.value}
            isLoading={loading.value}
            isVisible={true}
            onIonSelected={handleIonSelected}
          />
          <div class="w-full flex justify-end">
            <ElButton class="export-btn mr-8" onClick={handleExportCSV}>
              Export to CSV
            </ElButton>
          </div>
        </div>
      )
    }

    const renderSegmentationMapSection = () => {
      if (!diagnosticData.value) return null

      return (
        <ElCollapseItem
          name="segmentation-map"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header">
                <div class="collapse-left">
                  <span class="collapse-title">Segmentation map</span>
                  <ElButton size="small" link={true} onClick={handleResetView} class="action-button" title="Reset view">
                    <AspectRatioIcon class="w-6 h-6 fill-current text-gray-900" />
                  </ElButton>
                  {opticalImage.value && (
                    <ElButton
                      title="Toggle optical image"
                      link={true}
                      class={`${
                        state.showOpticalImage ? 'active' : ''
                      } button-reset flex h-6 channel-toggle !ml-0 !p-0`}
                      onClick={handleToggleOpticalImage}
                    >
                      <img
                        src="/src/assets/microscope-icon.png"
                        class="w-6 h-6 pointer-events-none"
                        style={{
                          filter: state.showOpticalImage ? '' : 'opacity(60%)',
                        }}
                      />
                    </ElButton>
                  )}
                </div>
                <div class="collapse-actions">
                  <ElButton
                    title="Ion image controls"
                    link={true}
                    class={`${state.showLegend ? 'active' : ''} button-reset flex h-6  channel-toggle !ml-0 !p-0`}
                    onClick={handleToggleLegend}
                  >
                    <StatefulIcon class="h-6 w-6 pointer-events-none" active={state.showLegend}>
                      <MonitorSvg class="fill-blue-700" />
                    </StatefulIcon>
                  </ElButton>
                </div>
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            <SegmentationVisualization
              diagnosticData={diagnosticData.value}
              showLegend={state.showLegend}
              resetViewTrigger={state.resetViewTrigger}
              opticalImage={opticalImage.value}
              showOpticalImage={state.showOpticalImage}
            />
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentMarkersSection = () => {
      if (!segmentationData.value) return null

      return (
        <ElCollapseItem
          name="segment-markers"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header">
                <span class="collapse-title">Segment markers</span>
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            {state.showSegmentMarkers && <SegmentMarkers segmentationId={segmentations.value?.[0]?.id} />}
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentationDiagnosticsSection = () => {
      if (!segmentationData.value) return null

      return (
        <ElCollapseItem
          name="diagnostics"
          class="ds-collapse el-collapse-item--no-padding relative"
          v-slots={{
            title: () => (
              <div class="collapse-header">
                <span class="collapse-title">Segmentation diagnostics</span>
              </div>
            ),
          }}
        >
          <div class="collapse-content">
            <SegmentationDiagnostics segmentationData={segmentationData.value} isLoading={loading.value} />
          </div>
        </ElCollapseItem>
      )
    }

    const renderSegmentationInfoWrapper = () => {
      if (!segmentationData.value) {
        return <div class="segmentation-info-wrapper w-full md:w-6/12" />
      }

      const activeNames = [...state.activeCollapseItems]

      return (
        <div class="segmentation-info-wrapper w-full md:w-6/12">
          <ElCollapse modelValue={[...activeNames]} class="segmentation-info-collapse" onChange={handleCollapseChange}>
            {renderSegmentationMapSection()}
            {renderSegmentMarkersSection()}
            {renderSegmentationDiagnosticsSection()}
          </ElCollapse>
        </div>
      )
    }

    return () => {
      if (loading.value) {
        return (
          <div class="segmentation-page">
            <div class="loading-container">
              <ElIcon class="loading-icon">
                <Loading />
              </ElIcon>
              <p>Loading segmentation data...</p>
            </div>
          </div>
        )
      }

      if (error.value) {
        return (
          <div class="segmentation-page">
            <div class="error-container">
              <ElAlert
                title="Error loading segmentation data"
                type="error"
                description={error.value.message}
                show-icon
                closable={false}
              />
              <ElButton onClick={goBack} class="back-button">
                <ElIcon>
                  <ArrowLeft />
                </ElIcon>
                Go Back
              </ElButton>
            </div>
          </div>
        )
      }

      if (!diagnosticData.value) {
        return (
          <div class="segmentation-page">
            <div class="no-data-container">
              <ElAlert
                title="No segmentation data available"
                type="info"
                description="This dataset doesn't have any segmentation analysis results."
                show-icon
                closable={false}
              />
              <ElButton onClick={goBack} class="back-button">
                <ElIcon>
                  <ArrowLeft />
                </ElIcon>
                Go Back
              </ElButton>
            </div>
          </div>
        )
      }

      return (
        <div class="segmentation-page">
          <div class="page-header">
            <div
              onClick={goBack}
              class="flex items-center text-blue-600 hover:text-blue-800 underline cursor-pointer mt-2 mb-1"
            >
              <ElIcon>
                <ArrowLeft />
              </ElIcon>
              Back to {currentDataset.value?.name} overview
            </div>
          </div>

          <div class="flex w-full flex-wrap flex-row">
            {renderHeatmapWrapper()}
            {renderSegmentationInfoWrapper()}
          </div>
        </div>
      )
    }
  },
})
