import { defineComponent, ref, reactive, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useStore } from 'vuex'
import { useMutation, useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import { ElButton, ElIcon, ElInput, ElMessageBox, ElNotification, ElPopover, ElTooltip } from '../lib/element-plus'
import * as FileSaver from 'file-saver'
import ChannelSelector from '../modules/ImageViewer/ChannelSelector.vue'
import './RoiSettings.scss'
import {
  getRoisQuery,
  createRoiMutation,
  updateRoiMutation,
  deleteRoiMutation,
  compareROIsMutation,
  validateRoiGeoJsonQuery,
  importRoisMutation,
  getDatasetDiagnosticsQuery,
  msAcqGeometryQuery,
} from '../api/dataset'
import safeJsonParse from '../lib/safeJsonParse'
import { roiToFeature, roisToFeatureCollection } from '../lib/roiGeoJson'
import StatefulIcon from '../components/StatefulIcon.vue'
import reportError from '../lib/reportError'
import { defineAsyncComponent } from 'vue'
import { Loading, DataLine } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { UserProfileQuery, userProfileQuery } from '@/api/user'
import { isPlanLimitError, notifyPlanLimitReached } from '../lib/planLimits'

const VisibleIcon = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-view-visible.svg'))

const HiddenIcon = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-view-hidden.svg'))

const RoiIcon = defineAsyncComponent(() => import('../assets/inline/roi-icon.svg'))

const SaveIcon = defineAsyncComponent(() => import('../assets/inline/save-icon.svg'))

const ExportIcon = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-cloud-download.svg'))

const ImportIcon = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-cloud-upload.svg'))

interface RoiSettingsProps {
  annotation: any
}

interface RoiSettingsState {
  updatingPopper: boolean
  isUpdatingRoi: boolean
  isExporting: boolean
  isImporting: boolean
  isLoadingDA: boolean
  rois: any[]
  isLoadingRois: boolean
  originalRoiIds: Set<string>
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

export default defineComponent({
  name: 'RoiSettings',
  props: {
    annotation: { type: Object as any, default: () => {} },
  },
  setup(props: RoiSettingsProps | any) {
    const apolloClient = inject(DefaultApolloClient)
    const store = useStore()
    const router = useRouter()
    const { mutate: createRoi } = useMutation(createRoiMutation)
    const { mutate: updateRoi } = useMutation(updateRoiMutation)
    const { mutate: deleteRoi } = useMutation(deleteRoiMutation)
    const { mutate: compareROIs } = useMutation(compareROIsMutation)
    const { mutate: importRois } = useMutation(importRoisMutation)

    const popover = ref<any>(null)
    const fileInput = ref<HTMLInputElement | null>(null)
    const state = reactive<RoiSettingsState>({
      updatingPopper: false,
      isUpdatingRoi: false,
      isExporting: false,
      isImporting: false,
      isLoadingDA: false,
      rois: [],
      isLoadingRois: false,
      originalRoiIds: new Set(),
    })

    const canEdit = computed(() => props.annotation?.dataset?.canEdit)

    const { result: currentUserResult } = useQuery<UserProfileQuery | any>(userProfileQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser = computed(() => (currentUserResult.value != null ? currentUserResult.value.currentUser : null))

    const isRoiVisible = computed(() => {
      return store.state.roiInfo?.visible || false
    })

    // ROI loading
    const roiQueryVars = computed(() => ({
      datasetId: props.annotation?.dataset?.id,
      userId: currentUser.value?.id,
    }))
    const roiQueryOptions = reactive({
      enabled: computed(() => !!props.annotation?.dataset?.id && isRoiVisible.value),
      fetchPolicy: 'cache-and-network' as const,
    })
    const { onResult: onRoisResult, refetch: refetchRois } = useQuery<any>(
      getRoisQuery,
      roiQueryVars,
      roiQueryOptions as any
    )

    // Ion-image pixel grid size, used to describe the export and to pre-flight-check an
    // import client-side before it's sent for authoritative server-side validation.
    const { result: acqGeometryResult } = useQuery<any>(
      msAcqGeometryQuery,
      computed(() => ({ datasetId: props.annotation?.dataset?.id })),
      { enabled: computed(() => !!props.annotation?.dataset?.id), fetchPolicy: 'cache-first' }
    )
    const imageBounds = computed(() => {
      const grid = safeJsonParse(acqGeometryResult.value?.dataset?.acquisitionGeometry)?.acquisition_grid
      return grid ? { width: grid.count_x, height: grid.count_y } : null
    })

    onRoisResult((result) => {
      if (result && result.data && result.data.rois) {
        // Track original ROI IDs from server
        state.originalRoiIds = new Set(result.data.rois.map((roi: any) => roi.id).filter((id: string) => id))
        state.rois = result.data.rois.map((roi: any, index: number) => {
          const geojson = JSON.parse(roi.geojson)
          const channelIndex = index % Object.keys(channels).length
          const channel: any = Object.values(channels)[channelIndex]

          // All ROIs now follow the unified format: coordinates as {x, y} objects in properties
          let coordinates = []

          if (geojson.properties?.coordinates) {
            coordinates = geojson.properties.coordinates.map((coord: any) => ({
              x: coord.x,
              y: coord.y,
            }))
          } else {
            console.warn('ROI missing coordinates in properties:', geojson)
          }

          // Get properties from GeoJSON (works for both legacy and new ROIs)
          const isLegacy = roi.id?.startsWith('legacy_')
          const props = geojson.properties || {}

          const roiData = {
            id: roi.id,
            name: roi.name,
            isDefault: roi.isDefault,
            isLegacy,
            coordinates,
            channel: props.channel || Object.keys(channels)[channelIndex],
            rgb: props.rgb || channel,
            color: props.color || channel.replace('rgb', 'rgba').replace(')', ', 0.4)'),
            strokeColor: props.strokeColor || channel.replace('rgb', 'rgba').replace(')', ', 0)'),
            visible: props.visible !== undefined ? props.visible : true,
            allVisible: props.allVisible !== undefined ? props.allVisible : true,
            edit: false,
            isDrawing: false,
            userId: roi.userId,
            canUpdate: roi.userId === currentUser.value?.id || canEdit.value,
          }

          return roiData
        })

        // Sync with Vuex store so ion image viewer can access ROI data
        // But respect the current visibility state - if ROI settings are hidden, hide all ROIs
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })

        // Only set ROI visibility if it's currently false and we have ROIs
        // This preserves user's visibility preference when navigating between datasets
        if (!isRoiVisible.value && state.rois.length > 0) {
          const hasVisibleRois = state.rois
            .filter((roi: any) => !roi.removed)
            .some((roi: any) => roi.visible || roi.allVisible)
          if (hasVisibleRois) {
            store.commit('toggleRoiVisibility', true)
            // Update the store with visible ROIs since we're now making them visible
            store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: state.rois })
          }
        }
      }
    })

    onMounted(() => {
      window.addEventListener('resize', resizeHandler)
    })

    onUnmounted(() => {
      store.commit('toggleRoiVisibility', false)
      window.removeEventListener('resize', resizeHandler)
    })

    const resizeHandler = () => {
      if (popover.value && !state.updatingPopper && typeof popover.value.updatePopper === 'function') {
        // update popper position
        state.updatingPopper = true
        popover.value.updatePopper()
        setTimeout(() => {
          state.updatingPopper = false
        }, 100)
      }
    }

    watch(
      () => store.getters.filter,
      () => {
        // hack to update popper position when some filters change reduces table width and misplace its position
        setTimeout(() => {
          resizeHandler()
        }, 0)
      }
    )

    // Watch for dataset changes to clear ROI data for the previous dataset
    watch(
      () => props.annotation?.dataset?.id,
      (newDatasetId, oldDatasetId) => {
        if (oldDatasetId && newDatasetId !== oldDatasetId) {
          // Clear ROI data for the previous dataset but preserve visibility state
          state.rois = []
          state.originalRoiIds = new Set()
        }

        // When switching to a new dataset, ensure ROI data in store reflects current visibility state
        if (newDatasetId && !isRoiVisible.value) {
          // If ROI settings are hidden, ensure no ROI data is in the store for this dataset
          store.commit('setRoiInfo', { key: newDatasetId, roi: [] })
        }
      }
    )

    // Watch for ROI visibility changes to update store data accordingly
    watch(
      () => isRoiVisible.value,
      (isVisible) => {
        if (props.annotation?.dataset?.id) {
          if (!isVisible) {
            // When ROI settings are hidden, clear ROI data from store to hide them from ion image
            store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: [] })
          } else if (state.rois.length > 0) {
            // When ROI settings are shown and we have ROI data, restore it to the store
            store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: state.rois })
          } else {
            // If ROI settings are shown but we don't have ROI data yet, try to refetch
            if (roiQueryOptions.enabled) {
              refetchRois()
            }
          }
        }
      },
      { immediate: true }
    )

    const getRoi = () => {
      return state.rois || []
    }

    // Helper function to find ROI index by ID
    const findRoiIndexById = (roiId: string) => {
      return state.rois.findIndex((roi: any) => roi.id === roiId || roi.tempId === roiId)
    }

    // Helper function to get stable ROI identifier
    const getRoiId = (roi: any) => {
      return roi.id || roi.tempId
    }

    const getRoisForStore = (rois: any[]) => {
      // If ROI settings are not visible, hide all ROIs on the ion image
      return isRoiVisible.value
        ? rois
        : rois.map((roi) => ({
            ...roi,
            visible: false,
            allVisible: false,
          }))
    }

    const addRoi = (e: any) => {
      e.stopPropagation()
      e.preventDefault()
      const index = state.rois.length % Object.keys(channels).length
      const channel: any = Object.values(channels)[index]

      // Generate a unique temporary ID for new ROIs
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const newRoi = {
        id: null, // Will be set when saved
        tempId, // Temporary ID for stable identification
        coordinates: [],
        channel: Object.keys(channels)[index],
        rgb: channel,
        color: channel.replace('rgb', 'rgba').replace(')', ', 0.4)'),
        strokeColor: channel.replace('rgb', 'rgba').replace(')', ', 0)'),
        name: `ROI ${state.rois.length + 1}`,
        visible: true,
        allVisible: true,
        edit: false,
        isDrawing: true,
        isDefault: false,
        canUpdate: true,
      }

      state.rois.push(newRoi)
      // Respect current visibility state when adding new ROI
      store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
    }

    const toggleAllHidden = (e: any = undefined, visible: boolean | any = undefined) => {
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      const isVisible = visible !== undefined ? visible : !store.state.roiInfo?.visible
      store.commit('toggleRoiVisibility', isVisible)

      // Update all ROIs visibility - create new array to ensure reactivity
      state.rois = state.rois.map((roi) => ({
        ...roi,
        allVisible: roi.removed ? roi.allVisible : isVisible,
        visible: roi.removed ? roi.visible : isVisible,
      }))

      // When hiding ROI settings, ensure ROIs are not displayed on the ion image
      store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
    }

    const handleSave = async (navigate: boolean = false) => {
      state.isUpdatingRoi = true

      try {
        const roiInfo = getRoi()
        // Delete ROIs that were marked as removed and exist on server (skip legacy IDs - they are not in DB)
        const removedRois = roiInfo.filter(
          (roi) => roi.removed && roi.id && !roi.id.startsWith('legacy_') && state.originalRoiIds.has(roi.id)
        )
        for (const removedRoi of removedRois) {
          try {
            await deleteRoi({ id: removedRoi.id })
          } catch (e) {
            // pass
          }
        }

        // Also delete ROIs that were removed locally but exist on server (legacy logic)
        const currentRoiIds = new Set(
          roiInfo
            .filter((roi) => !roi.removed)
            .map((roi) => roi.id)
            .filter((id) => id)
        )
        for (const originalRoiId of state.originalRoiIds) {
          if (!currentRoiIds.has(originalRoiId) && !originalRoiId.startsWith('legacy_')) {
            try {
              await deleteRoi({ id: originalRoiId })
            } catch (e) {
              // pass
            }
          }
        }
        for (const roi of roiInfo) {
          if (roi && !roi.isDrawing && !roi.removed && roi.coordinates.length > 0) {
            const roiInput = {
              name: roi.name,
              isDefault: roi.isDefault || false,
              geojson: JSON.stringify(roiToFeature(roi)),
            }

            if (roi.id && !roi.isLegacy && roi.canUpdate) {
              // Update existing ROI (not legacy)
              await updateRoi({ id: roi.id, input: roiInput })
            } else {
              const result = await createRoi({
                datasetId: props.annotation?.dataset?.id,
                input: roiInput,
              })
              if ((result as any)?.data?.createRoi) {
                roi.id = (result as any).data.createRoi.id
                roi.isLegacy = false // Mark as migrated
              }
            }
          }
        }

        // Refresh ROI list
        await refetchRois()

        if (navigate) {
          await compareROIs({ datasetId: props.annotation?.dataset?.id })
          router.push(`/dataset/${props.annotation?.dataset?.id}/diff-analysis`)
        }
      } catch (e) {
        ElNotification.error(`There was a problem saving the ROI settings.`)
        reportError(new Error(`Error saving ROI: ${JSON.stringify(e)}`), null)
      } finally {
        setTimeout(() => {
          state.isUpdatingRoi = false
        }, 1000)
      }
    }

    const handleExportGeoJson = () => {
      const roiInfo = getRoi().filter((roi: any) => !roi.removed)
      if (roiInfo.length === 0) {
        return
      }

      state.isExporting = true
      try {
        const featureCollection = roisToFeatureCollection(roiInfo, {
          datasetId: props.annotation?.dataset?.id,
          datasetName: props.annotation?.dataset?.name,
          imageWidth: imageBounds.value?.width,
          imageHeight: imageBounds.value?.height,
        })
        const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' })
        FileSaver.saveAs(blob, `${(props.annotation?.dataset?.name || 'dataset').replace(/\s/g, '_')}_ROI.geojson`)
      } finally {
        state.isExporting = false
      }
    }

    const triggerImport = () => {
      fileInput.value?.click()
    }

    const handleImportGeoJson = async (e: Event) => {
      const input = e.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = '' // allow re-selecting the same file
      if (!file) {
        return
      }

      state.isImporting = true
      try {
        const text = await file.text()
        const { data } = await apolloClient.query({
          query: validateRoiGeoJsonQuery,
          variables: { datasetId: props.annotation?.dataset?.id, geojson: text },
          fetchPolicy: 'no-cache',
        })
        const validation = data?.validateRoiGeoJson

        if (!validation?.valid) {
          const messages = (validation?.errors || []).map((issue: any) => issue.message)
          ElNotification.error({
            title: 'This GeoJSON file cannot be imported',
            message: messages.join('\n') || 'The file is not a valid ROI GeoJSON export.',
            dangerouslyUseHTMLString: false,
            duration: 0,
          })
          return
        }

        const warningMessages = (validation.warnings || []).map((issue: any) => issue.message)
        const confirmMessage = [
          `${validation.roiCount} ROI${validation.roiCount === 1 ? '' : 's'} found in this file. ` +
            'They will be added alongside the existing ROIs on this dataset.',
          ...(warningMessages.length > 0 ? ['', 'Warnings:', ...warningMessages] : []),
        ].join('\n')

        try {
          await ElMessageBox.confirm(confirmMessage, 'Import ROIs from GeoJSON', {
            confirmButtonText: 'Import',
            cancelButtonText: 'Cancel',
            lockScroll: false,
          })
        } catch (cancel) {
          return
        }

        await importRois({ datasetId: props.annotation?.dataset?.id, geojson: text })
        await refetchRois()
        ElNotification.success(`Imported ${validation.roiCount} ROI${validation.roiCount === 1 ? '' : 's'}.`)
      } catch (err) {
        ElNotification.error('There was a problem importing the ROI GeoJSON file.')
        reportError(new Error(`Error importing ROI GeoJSON: ${JSON.stringify(err)}`), null)
      } finally {
        state.isImporting = false
      }
    }

    const handleDiffAnalysis = async () => {
      if (!currentUser.value?.id) {
        ElNotification.warning('You need to be logged in to run the differential analysis.')
        return
      }

      state.isLoadingDA = true

      try {
        // check if dataset needs reprocessing
        const diagnosticsResult = await apolloClient.query({
          query: getDatasetDiagnosticsQuery,
          variables: { id: props.annotation?.dataset?.id },
        })
        const diagnostics = diagnosticsResult.data?.dataset?.diagnostics?.filter(
          (diagnostic: any) => diagnostic.type === 'FDR_RESULTS'
        )
        if (diagnostics.length === 0) {
          ElNotification.warning('Your dataset needs to be reprocessed in order to run the differential analysis.')
          state.isLoadingDA = false
          return
        }

        // const roiInfo = getRoi().filter((roi: any) => !roi.removed)
        // const hasLegacyRois = roiInfo.some((roi: any) => roi.isLegacy)
        await handleSave(false)

        // Now run the differential analysis
        await compareROIs({ datasetId: props.annotation?.dataset?.id })
        router.push(`/dataset/${props.annotation?.dataset?.id}/diff-analysis`)
      } catch (e: any) {
        if (isPlanLimitError(e)) {
          notifyPlanLimitReached('differential analyses')
        } else {
          ElNotification.error('There was a problem running the differential analysis. Please contact support.')
          reportError(new Error(`Error running differential analysis: ${JSON.stringify(e)}`), null)
        }
      } finally {
        state.isLoadingDA = false
      }
    }

    const handleNameEdit = (value: any, roiId: string) => {
      const roiIndex = findRoiIndexById(roiId)
      if (roiIndex !== -1) {
        state.rois[roiIndex].name = value
        // Create a new array to trigger reactivity
        state.rois = [...state.rois]
        // Respect current visibility state
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
      }
    }

    const toggleEdit = (roiId: string) => {
      const roiIndex = findRoiIndexById(roiId)
      if (roiIndex !== -1) {
        state.rois[roiIndex].edit = !state.rois[roiIndex].edit
        // Create a new array to trigger reactivity
        state.rois = [...state.rois]
        // Respect current visibility state
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
      }
    }

    const toggleHidden = (roiId: string) => {
      const roiIndex = findRoiIndexById(roiId)
      if (roiIndex !== -1) {
        state.rois[roiIndex].visible = !state.rois[roiIndex].visible
        // Create a new array to trigger reactivity
        state.rois = [...state.rois]
        // Respect current visibility state
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
      }
    }

    const removeRoi = (roiId: string) => {
      const roiIndex = findRoiIndexById(roiId)
      if (roiIndex !== -1) {
        state.rois[roiIndex].removed = true
        state.rois[roiIndex].visible = false
        // Create a new array to trigger reactivity
        state.rois = [...state.rois]
        // Respect current visibility state
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
      }
    }

    const changeRoi = (channel: any, roiId: string) => {
      const roiIndex = findRoiIndexById(roiId)
      if (roiIndex !== -1) {
        state.rois[roiIndex].channel = channel
        state.rois[roiIndex].rgb = channels[channel]
        state.rois[roiIndex].strokeColor = channels[channel].replace('rgb', 'rgba').replace(')', ', 0)')
        state.rois[roiIndex].color = channels[channel].replace('rgb', 'rgba').replace(')', ', 0.4)')
        // Create a new array to trigger reactivity
        state.rois = [...state.rois]
        // Respect current visibility state
        store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi: getRoisForStore(state.rois) })
      }
    }

    const renderRoiIcon = () => {
      const isVisible = isRoiVisible.value

      return (
        <div>
          <ElButton
            class={`roi-btn button-reset flex h-6 w-6 mr-3 ${isVisible ? 'active' : ''}`}
            onClick={toggleAllHidden}
          >
            <StatefulIcon class="roi-badge h-6 w-7" active={isVisible}>
              <RoiIcon class="roi-icon fill-current" />
            </StatefulIcon>
          </ElButton>
        </div>
      )
    }

    const renderRoiIconContent = () => {
      return <div class="max-w-xs">Create and save ROIs, or export/import them as GeoJSON.</div>
    }

    const renderMainPopoverReference = () => {
      const isVisible = isRoiVisible.value

      return (
        <div>
          <ElPopover
            trigger="hover"
            placement="bottom"
            disabled={isVisible}
            v-slots={{
              reference: renderRoiIcon,
              default: renderRoiIconContent,
            }}
          />
        </div>
      )
    }

    const renderRoiSettings = () => {
      const roiInfo = (state.rois || []).filter((roi: any) => !roi.removed)

      return (
        <div class="roi-content">
          <div class="roi-options">
            <ElTooltip
              popperClass="roi-save-tooltip"
              content={
                currentUser.value?.id
                  ? 'Click to perform differential analysis among the ROIs.'
                  : 'Please log in to perform differential analysis among the ROIs.'
              }
              placement="top"
            >
              {!state.isLoadingDA && (
                <ElButton
                  class="button-reset roi-diff-icon"
                  onClick={handleDiffAnalysis}
                  disabled={roiInfo.length === 0 || !currentUser.value?.id}
                >
                  <ElIcon size={25}>
                    <DataLine />
                  </ElIcon>
                </ElButton>
              )}
              {state.isLoadingDA && (
                <div class="button-reset roi-download-icon">
                  <ElIcon class="is-loading">
                    <Loading />
                  </ElIcon>
                </div>
              )}
            </ElTooltip>

            <div class="flex flex-row flex-wrap justify-end items-center">
              <input
                ref={fileInput}
                type="file"
                accept=".geojson,application/geo+json,.json,application/json"
                class="hidden"
                onChange={handleImportGeoJson}
              />
              <ElTooltip popperClass="roi-save-tooltip" content="Import ROIs from a GeoJSON file." placement="top">
                {!state.isImporting && (
                  <ElButton class="button-reset roi-upload-icon" onClick={triggerImport}>
                    <ImportIcon class="fill-current w-5 h-5" />
                  </ElButton>
                )}
                {state.isImporting && (
                  <div class="button-reset roi-upload-icon">
                    <ElIcon class="is-loading">
                      <Loading />
                    </ElIcon>
                  </div>
                )}
              </ElTooltip>
              {roiInfo.length > 0 && !state.isExporting && (
                <ElTooltip popperClass="roi-save-tooltip" content="Export ROIs as a GeoJSON file." placement="top">
                  <ElButton class="button-reset roi-download-icon" onClick={handleExportGeoJson}>
                    <ExportIcon class="fill-current w-5 h-5" />
                  </ElButton>
                </ElTooltip>
              )}
              {roiInfo.length > 0 && state.isExporting && (
                <div class="button-reset roi-download-icon">
                  <ElIcon class="is-loading">
                    <Loading />
                  </ElIcon>
                </div>
              )}
              <ElTooltip
                popperClass="roi-save-tooltip"
                content={
                  'Click to save the ROIs. If you can edit the dataset, they will be saved as ' +
                  'default and visible to everyone with access. Otherwise, they will be saved only for you.'
                }
                placement="top"
              >
                {!state.isUpdatingRoi && (
                  <ElButton
                    class={`button-reset roi-save-icon-wrapper ${currentUser.value?.id ? '' : 'save-disabled'}`}
                    disabled={!currentUser.value?.id}
                    onClick={() => handleSave(false)}
                  >
                    <StatefulIcon class="roi-save-icon-wrapper" active={props.annotation?.dataset?.canEdit}>
                      <SaveIcon class="roi-save-icon fill-current" />
                    </StatefulIcon>
                  </ElButton>
                )}
                {state.isUpdatingRoi && (
                  <div class="button-reset roi-download-icon">
                    <ElIcon class="is-loading">
                      <Loading />
                    </ElIcon>
                  </div>
                )}
              </ElTooltip>
            </div>
          </div>
          {roiInfo.map((roi: any) => {
            const roiId = getRoiId(roi)
            return (
              <div key={`roi-${roiId}`} class="roi-item relative">
                <div class="flex w-full justify-between items-center w-28">
                  {!roi.edit && (
                    <span class="roi-label" style={{ color: roi.channel }}>
                      {roi.name}
                    </span>
                  )}
                  {roi.edit && (
                    <ElInput
                      class="roi-label"
                      size="small"
                      modelValue={roi.name}
                      onChange={() => toggleEdit(roiId)}
                      onInput={(value: any) => {
                        handleNameEdit(value, roiId)
                      }}
                    />
                  )}
                  <div class="flex justify-center items-center">
                    <ElButton class="button-reset h-5" icon="Edit" onClick={() => toggleEdit(roiId)} />
                    <ElButton class="button-reset h-5" onClick={() => toggleHidden(roiId)}>
                      {roi.visible && <VisibleIcon class="fill-current w-5 h-5 text-gray-800" />}{' '}
                      {!roi.visible && <HiddenIcon class="fill-current w-5 h-5 text-gray-800" />}
                    </ElButton>
                  </div>
                </div>
                <div class="roi-channels">
                  <ChannelSelector
                    class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end"
                    value={roi.channel} // @ts-ignore
                    onRemove={() => removeRoi(roiId)}
                    onInput={(value: any) => changeRoi(value, roiId)}
                  />
                </div>
              </div>
            )
          })}
          <ElButton
            class="button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100 w-full"
            onClick={addRoi}
          >
            Add ROI
          </ElButton>
        </div>
      )
    }

    return () => {
      const isVisible = isRoiVisible.value

      return (
        <ElPopover
          ref={popover}
          popperClass="roi-popper"
          placement="bottom"
          width="200"
          visible={isVisible}
          v-slots={{
            reference: renderMainPopoverReference,
            default: renderRoiSettings,
          }}
        />
      )
    }
  },
})
