import { computed, defineComponent, onMounted, reactive, watch } from 'vue'
import config from '../../../lib/config'
import MainImage from '../../Annotations/annotation-widgets/default/MainImage.vue'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import FadeTransition from '../../../components/FadeTransition'
import RangeSlider from '../../../components/Slider/RangeSlider.vue'
import IonIntensity from '../../ImageViewer/IonIntensity.vue'
import { loadPngFromUrl, processIonImage, renderScaleBar, ScaleType } from '../../../lib/ionImageRendering'
import { get, throttle } from 'lodash-es'
import createColormap from '../../../lib/createColormap'
import getColorScale from '../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../components/Slider'
import './SimpleIonImageViewer.scss'
import { useRoute } from 'vue-router'
import { ElCollapseItem } from '../../../lib/element-plus'

interface ImageSettings {
  isNormalized: boolean
  lockedIntensities: [number | undefined, number | undefined]
  scaleBarColor: string
  scaleType: ScaleType
  colormap: string
  annotImageOpacity: number
  opticalOpacity: number
  opacityMode: string
  imagePosition: any
  opticalSrc: string | null
  opticalTransform: any
  userScaling: [number, number]
  imageScaledScaling: [number, number]
  pixelAspectRatio: number
  intensity?: any
  colorBar?: any
}

interface SimpleIonImageViewerState {
  scaleIntensity: boolean
  ionImageUrl: any
  ionImage: any
  rangeSliderStyle: any
  imageSettings: ImageSettings
}

export default defineComponent({
  name: 'SimpleIonImageViewer',
  props: {
    annotation: {
      type: Object,
      default: undefined,
    },
    normalizationData: {
      type: Object,
      default: () => {},
    },
    ionImageUrl: {
      type: String,
      default: null,
    },
    pixelSizeX: {
      type: Number,
      default: 0,
    },
    pixelSizeY: {
      type: Number,
      default: 0,
    },
    isNormalized: {
      type: Boolean,
      default: false,
    },
    roiInfo: {
      type: Array,
      default: () => [],
    },
    width: {
      type: Number,
      default: 500,
    },
    height: {
      type: Number,
      default: 500,
    },
    maxHeight: {
      type: Number,
      default: 1000,
    },
    renderAsCollapsible: {
      type: Boolean,
      default: false,
    },
    lockedIntensities: {
      type: Array as any,
      default: () => [undefined, undefined],
    },
  },
  setup: function (props, { emit }) {
    const route = useRoute()
    const state = reactive<SimpleIonImageViewerState>({
      ionImage: undefined,
      rangeSliderStyle: undefined,
      scaleIntensity: false,
      imageSettings: {
        isNormalized: props.isNormalized || !!route.query.norm,
        lockedIntensities: props.lockedIntensities,
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        colormap: 'Viridis',
        scaleType: 'linear',
        opacityMode: 'constant',
        scaleBarColor: '#000000',
        imagePosition: {
          zoom: 1,
          xOffset: 0,
          yOffset: 0,
        },
        opticalSrc: null,
        opticalTransform: null,
        userScaling: [0, 1],
        imageScaledScaling: [0, 1],
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio
          ? 1
          : (props.pixelSizeX && props.pixelSizeY && props.pixelSizeX / props.pixelSizeY) || 1,
      },
      ionImageUrl: undefined,
    })

    onMounted(() => {
      if (state.imageSettings === undefined && props.pixelSizeY && props.pixelSizeX) {
        startImageLoaderSettings()
      }
    })

    const annotation = computed(() => {
      if (props.annotation) {
        setIonImage()
        return props.annotation
      }
      return null
    })

    const ionImageUrl = computed(() => props.ionImageUrl)

    const handleIonIntensityChange = async (intensity: number, type: string) => {
      // Validate input intensity
      if (!isFinite(intensity) || intensity < 0) {
        console.warn('Invalid intensity value:', intensity)
        return
      }

      // If the intensity is locked, update the locked value directly
      if (type === 'min' && state.imageSettings.intensity?.min?.status === 'LOCKED') {
        const newLockedIntensities: [number | undefined, number | undefined] = [
          intensity,
          state.imageSettings.lockedIntensities[1],
        ]
        applyLockedIntensities(newLockedIntensities)
        emit('intensityLockChange', newLockedIntensities)
        return
      }

      if (type === 'max' && state.imageSettings.intensity?.max?.status === 'LOCKED') {
        const newLockedIntensities: [number | undefined, number | undefined] = [
          state.imageSettings.lockedIntensities[0],
          intensity,
        ]
        applyLockedIntensities(newLockedIntensities)
        emit('intensityLockChange', newLockedIntensities)
        return
      }

      // For unlocked intensities, use the original scaling logic
      const maxImageIntensity = state.imageSettings.intensity?.max?.image
      if (!maxImageIntensity || maxImageIntensity <= 0) {
        console.warn('Invalid max image intensity:', maxImageIntensity)
        return
      }

      let minScale = state.imageSettings.userScaling[0]
      let maxScale = state.imageSettings.userScaling[1]

      if (type === 'min') {
        minScale = intensity / maxImageIntensity
        minScale = Math.max(0, Math.min(1, minScale))
        minScale = Math.min(minScale, maxScale)
      } else {
        maxScale = intensity / maxImageIntensity
        maxScale = Math.max(0, Math.min(1, maxScale))
        maxScale = Math.max(maxScale, minScale)
      }

      // Validate the calculated scales
      if (!isFinite(minScale) || !isFinite(maxScale)) {
        console.warn('Invalid scale values:', { minScale, maxScale })
        return
      }

      handleUserScalingChange([minScale, maxScale])
    }

    const handleUserScalingChange = async (userScaling: any) => {
      // Validate userScaling input
      if (
        !Array.isArray(userScaling) ||
        userScaling.length !== 2 ||
        !isFinite(userScaling[0]) ||
        !isFinite(userScaling[1])
      ) {
        console.warn('Invalid userScaling:', userScaling)
        return
      }

      state.imageSettings.userScaling = userScaling as [number, number]

      const maxImageIntensity = state.imageSettings.intensity?.max?.image
      if (!maxImageIntensity || maxImageIntensity <= 0) {
        console.warn('Invalid max image intensity in handleUserScalingChange:', maxImageIntensity)
        return
      }

      let minScale = userScaling[0]
      let maxScale = userScaling[1]

      // Handle locked min intensity
      if (state.imageSettings.intensity?.min?.status === 'LOCKED') {
        const minUser = state.imageSettings.intensity.min.user
        if (isFinite(minUser) && minUser >= 0) {
          const ratio = minUser / maxImageIntensity
          minScale = userScaling[0] * (1 - ratio) + ratio
        }
      }

      // Handle locked max intensity
      if (state.imageSettings.intensity?.max?.status === 'LOCKED') {
        const maxUser = state.imageSettings.intensity.max.user
        if (isFinite(maxUser) && maxUser >= 0) {
          maxScale = userScaling[1] * (maxUser / maxImageIntensity)
        }
      }

      // Validate calculated scales
      if (!isFinite(minScale) || !isFinite(maxScale)) {
        console.warn('Invalid calculated scales:', { minScale, maxScale })
        return
      }

      const scale: [number, number] = [minScale, maxScale]
      state.imageSettings.imageScaledScaling = scale

      // Calculate scaled intensities with validation
      let minScaled = maxImageIntensity * userScaling[0]
      let maxScaled = maxImageIntensity * userScaling[1]

      // Handle locked min intensity
      if (state.imageSettings.intensity?.min?.status === 'LOCKED') {
        const minUser = state.imageSettings.intensity.min.user
        if (isFinite(minUser) && minUser >= 0 && minScaled < minUser) {
          minScaled = minUser
        }
      }

      // Handle locked max intensity
      if (state.imageSettings.intensity?.max?.status === 'LOCKED') {
        const maxUser = state.imageSettings.intensity.max.user
        if (isFinite(maxUser) && maxUser >= 0 && maxScaled > maxUser) {
          maxScaled = maxUser
        }
      }

      // Validate calculated intensities
      if (!isFinite(minScaled) || !isFinite(maxScaled)) {
        console.warn('Invalid scaled intensities:', { minScaled, maxScaled })
        return
      }

      state.imageSettings['intensity'] = {
        ...state.imageSettings.intensity,
        min: {
          ...state.imageSettings.intensity?.min,
          scaled: minScaled,
        },
        max: {
          ...state.imageSettings.intensity.max,
          scaled: maxScaled,
        },
      }
    }

    const applyLockedIntensities = (lockedIntensities: [number | undefined, number | undefined]) => {
      if (!state.ionImage) return

      const [minLocked, maxLocked] = lockedIntensities

      // If no intensities are locked, reset to defaults
      if (minLocked === undefined && maxLocked === undefined) {
        state.imageSettings.userScaling = [0, 1]
        state.imageSettings.imageScaledScaling = [0, 1]
        state.imageSettings.intensity = getIntensity(state.ionImage)
        state.imageSettings.lockedIntensities = [undefined, undefined]
        return
      }

      // Validate locked intensities
      if (minLocked !== undefined && (!isFinite(minLocked) || minLocked < 0)) {
        console.warn('Invalid min locked intensity:', minLocked)
        return
      }
      if (maxLocked !== undefined && (!isFinite(maxLocked) || maxLocked < 0)) {
        console.warn('Invalid max locked intensity:', maxLocked)
        return
      }

      const intensity: any = getIntensity(state.ionImage, lockedIntensities)
      if (!intensity) return

      if (intensity.max && maxLocked !== undefined && intensity.max.status === 'LOCKED') {
        intensity.max.scaled = maxLocked
        intensity.max.user = maxLocked
        intensity.max.clipped = maxLocked
      }

      if (intensity.min && minLocked !== undefined && intensity.min.status === 'LOCKED') {
        intensity.min.scaled = minLocked
        intensity.min.user = minLocked
        intensity.min.clipped = minLocked
      }

      if (intensity.min && intensity.min.status !== 'LOCKED') {
        state.imageSettings.imageScaledScaling = [0, state.imageSettings.imageScaledScaling[1]]
      }
      if (intensity.max && intensity.max.status !== 'LOCKED') {
        state.imageSettings.imageScaledScaling = [state.imageSettings.imageScaledScaling[0], 1]
      }

      state.imageSettings.lockedIntensities = lockedIntensities
      state.imageSettings.intensity = intensity
      state.imageSettings.userScaling = [0, 1]
    }

    const handleIonIntensityLockChange = async (value: number, type: string) => {
      const minLocked = type === 'min' ? value : state.imageSettings.lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.imageSettings.lockedIntensities[1]
      const lockedIntensities: [number | undefined, number | undefined] = [minLocked, maxLocked]

      applyLockedIntensities(lockedIntensities)

      // Emit the intensity lock change to parent component
      emit('intensityLockChange', lockedIntensities)
    }

    const setIonImage = async () => {
      if (ionImageUrl.value) {
        const ionImagePng = await loadPngFromUrl(ionImageUrl.value)
        const isotopeImage = get(annotation.value, 'isotopeImages[0]')
        const { minIntensity, maxIntensity } = isotopeImage
        state.ionImage = await processIonImage(
          ionImagePng,
          minIntensity,
          maxIntensity,
          state.imageSettings.scaleType,
          undefined,
          undefined,
          state.imageSettings.isNormalized ? props.normalizationData : null
        )
        // Apply locked intensities if they exist, otherwise reset to defaults
        if (
          state.imageSettings.lockedIntensities &&
          (state.imageSettings.lockedIntensities[0] !== undefined ||
            state.imageSettings.lockedIntensities[1] !== undefined)
        ) {
          applyLockedIntensities(state.imageSettings.lockedIntensities)
        } else {
          // Reset user scaling and intensity to defaults when no intensities are locked
          state.imageSettings.userScaling = [0, 1]
          state.imageSettings.imageScaledScaling = [0, 1]
          state.imageSettings.intensity = getIntensity(state.ionImage)
        }
        buildRangeSliderStyle()
      } else {
        state.ionImage = null
      }
    }

    const handlePixelSelect = (coordinates: any) => {
      emit('pixelSelected', coordinates)
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any) => {
      state.imageSettings.imagePosition.zoom = zoom
      state.imageSettings.imagePosition.xOffset = xOffset
      state.imageSettings.imagePosition.yOffset = yOffset
    }

    const handleColormapChange = (colormap: string) => {
      state.imageSettings.colormap = colormap
    }

    const handleScaleTypeChange = (scaleType: ScaleType) => {
      state.imageSettings.scaleType = scaleType
      // Reprocess the image with the new scale type to update intensity values and range slider
      setIonImage()
    }

    const handleScaleBarColorChange = (color: string) => {
      state.imageSettings.scaleBarColor = color
    }

    const handleNormalizationChange = (isNormalized: boolean) => {
      emit('normalization', isNormalized)
      state.imageSettings.isNormalized = props.isNormalized || isNormalized
      // Reprocess the image with new normalization setting
      setIonImage()
    }

    const buildRangeSliderStyle = (scaleRange: number[] = [0, 1]) => {
      const width = 190
      const activeColorMap = state.imageSettings.colormap
      const ionImage = state.ionImage
      const cmap = createColormap(activeColorMap)
      const { range } = getColorScale(activeColorMap)
      const { scaledMinIntensity, scaledMaxIntensity } = ionImage || {}
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const gradient =
        scaledMinIntensity === scaledMaxIntensity
          ? `linear-gradient(to right, ${range.join(',')})`
          : ionImage
          ? `url(${renderScaleBar(ionImage, cmap, true)})`
          : ''

      state.imageSettings.colorBar = {
        minColor,
        maxColor,
        gradient,
      }

      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + (width - THUMB_WIDTH * 2) * minScale)
      const maxStop = Math.ceil(THUMB_WIDTH + (width - THUMB_WIDTH * 2) * maxScale)
      state.rangeSliderStyle = {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const getIntensityData = (
      image: number,
      clipped: number,
      scaled: number,
      user: number,
      quantile: number,
      isLocked?: boolean
    ) => {
      const isClipped = quantile > 0 && quantile < 1 && user === image
      return {
        image,
        clipped,
        scaled,
        user,
        quantile,
        status: isLocked ? 'LOCKED' : isClipped ? 'CLIPPED' : undefined,
      }
    }

    const getIntensity = (ionImage: any, lockedIntensities: any = []) => {
      if (ionImage !== null) {
        const {
          minIntensity,
          maxIntensity,
          clippedMinIntensity,
          clippedMaxIntensity,
          scaledMinIntensity,
          scaledMaxIntensity,
          userMinIntensity,
          userMaxIntensity,
          lowQuantile,
          highQuantile,
        } = ionImage || {}
        const [lockedMin, lockedMax] = lockedIntensities

        return {
          min: getIntensityData(
            minIntensity,
            clippedMinIntensity,
            scaledMinIntensity,
            userMinIntensity,
            lowQuantile,
            lockedMin !== undefined
          ),
          max: getIntensityData(
            maxIntensity,
            clippedMaxIntensity,
            scaledMaxIntensity,
            userMaxIntensity,
            highQuantile,
            lockedMax !== undefined
          ),
        }
      }
      return null
    }

    const startImageLoaderSettings = () => {
      state.imageSettings = {
        isNormalized: props.isNormalized || !!route.query.norm,
        lockedIntensities: props.lockedIntensities,
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        colormap: 'Viridis',
        scaleType: 'linear',
        opacityMode: 'constant',
        scaleBarColor: '#000000',
        imagePosition: {
          zoom: 1,
          xOffset: 0,
          yOffset: 0,
        },
        opticalSrc: null,
        opticalTransform: null,
        userScaling: [0, 1],
        imageScaledScaling: [0, 1],
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio
          ? 1
          : (props.pixelSizeX && props.pixelSizeY && props.pixelSizeX / props.pixelSizeY) || 1,
      }
      setIonImage()
    }

    watch(
      () => props.isNormalized,
      (newValue) => {
        handleNormalizationChange(newValue)
      }
    )

    watch(
      () => props.lockedIntensities,
      (newValue) => {
        if (newValue && state.ionImage) {
          applyLockedIntensities(newValue as [number | undefined, number | undefined])
        }
      },
      { deep: true }
    )

    // Watch for annotation changes to reset unlocked intensity changes
    watch(
      () => props.annotation,
      (newAnnotation, oldAnnotation) => {
        if (newAnnotation && oldAnnotation && newAnnotation.id !== oldAnnotation.id) {
          // Reset user scaling when switching to a different annotation
          // if no intensities are locked
          const hasLockedIntensities =
            state.imageSettings.lockedIntensities &&
            (state.imageSettings.lockedIntensities[0] !== undefined ||
              state.imageSettings.lockedIntensities[1] !== undefined)

          if (!hasLockedIntensities) {
            state.imageSettings.userScaling = [0, 1]
            state.imageSettings.imageScaledScaling = [0, 1]
          }
        }
      }
    )

    const renderHeader = (hideTitle: boolean = true) => {
      if (!state.imageSettings) return null

      return (
        <MainImageHeader
          class="simple-ion-image-item-header dom-to-image-hidden"
          annotation={annotation.value}
          hideTitle={hideTitle}
          isActive={false}
          showOpticalImage={false}
          toggleOpticalImage={() => {}}
          resetViewport={startImageLoaderSettings}
          hasOpticalImage={false}
          colormap={state.imageSettings.colormap}
          onColormapChange={handleColormapChange}
          scaleType={state.imageSettings.scaleType}
          onScaleTypeChange={handleScaleTypeChange}
          onScaleBarColorChange={handleScaleBarColorChange}
          onNormalizationChange={handleNormalizationChange}
        />
      )
    }

    const renderContent = () => {
      if (!(annotation.value && state.imageSettings)) {
        return null
      }
      return (
        <div class="relative">
          <MainImage
            keepPixelSelected
            annotation={annotation.value}
            opacity={1}
            hideColorBar
            imageLoaderSettings={state.imageSettings}
            imagePosition={state.imageSettings.imagePosition}
            applyImageMove={handleImageMove}
            colormap={state.imageSettings.colormap}
            scaleBarColor={state.imageSettings.scaleBarColor}
            normalizationData={props.normalizationData}
            isNormalized={state.imageSettings.isNormalized}
            scaleType={state.imageSettings.scaleType}
            userScaling={state.imageSettings.imageScaledScaling}
            pixelSizeX={props.pixelSizeX}
            pixelSizeY={props.pixelSizeY}
            roiInfo={props.roiInfo}
            width={props.width}
            height={props.height}
            maxHeight={props.maxHeight}
            {...{ on: { 'pixel-select': handlePixelSelect } }}
          />
          <div class="ds-viewer-controls-wrapper  v-rhythm-3 sm-side-bar">
            <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
              <div class="range-slider p-3 bg-gray-100 rounded-lg box-border shadow-xs">
                {state.imageSettings.userScaling && state.rangeSliderStyle && (
                  <RangeSlider
                    class="ds-comparison-opacity-item"
                    value={state.imageSettings.userScaling}
                    min={0}
                    max={1}
                    step={0.1}
                    style={state.rangeSliderStyle}
                    onInput={throttle((userScaling: any) => {
                      handleUserScalingChange(userScaling)
                    }, 1000)}
                  />
                )}
                {state.imageSettings.intensity && (
                  <div class="ds-intensities-wrapper">
                    <IonIntensity
                      intensities={state.imageSettings.intensity.min}
                      label="Minimum intensity"
                      placeholder="min."
                      onInput={(value: number) => handleIonIntensityChange(value, 'min')}
                      onLock={(value: number) => handleIonIntensityLockChange(value, 'min')}
                    />
                    <IonIntensity
                      intensities={state.imageSettings.intensity.max}
                      label="Maximum intensity"
                      placeholder="man."
                      onInput={(value: number) => handleIonIntensityChange(value, 'max')}
                      onLock={(value: number) => handleIonIntensityLockChange(value, 'max')}
                    />
                  </div>
                )}
              </div>
            </FadeTransition>
          </div>
        </div>
      )
    }

    const renderImageView = () => {
      return (
        <>
          {renderHeader()}
          {renderContent()}
        </>
      )
    }

    return () => {
      if (props.renderAsCollapsible) {
        return (
          <ElCollapseItem
            name="image-viewer"
            title="Image Viewer"
            class="simple-ion-image-container ds-collapse el-collapse-item--no-padding relative"
            v-slots={{
              title: () => renderHeader(false),
              default: () => renderContent(),
            }}
          />
        )
      }
      return <div class={'simple-ion-image-container'}>{renderImageView()}</div>
    }
  },
})
