import { computed, defineComponent, onMounted, reactive, watch } from '@vue/composition-api'
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
import Vue from 'vue'
import './SimpleIonImageViewer.scss'

interface ImageSettings {
  isNormalized: boolean
  lockedIntensities: [number | undefined, number | undefined],
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
  intensity?: any,
  colorBar?: any
}

interface SimpleIonImageViewerProps {
  isNormalized: boolean
  annotation: any
  normalizationData: any
  ionImageUrl: string | null
  pixelSizeX: number
  pixelSizeY: number
}

interface SimpleIonImageViewerState {
  scaleIntensity: boolean
  ionImageUrl: any
  ionImage: any
  rangeSliderStyle: any
  imageSettings: ImageSettings
}

export default defineComponent<SimpleIonImageViewerProps>({
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
  },
  setup: function(props, { emit, root }) {
    const { $route } = root
    const state = reactive<SimpleIonImageViewerState>({
      ionImage: undefined,
      rangeSliderStyle: undefined,
      scaleIntensity: false,
      imageSettings: {
        isNormalized: props.isNormalized || !!$route.query.norm,
        lockedIntensities: [undefined, undefined],
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
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio ? 1
          : props.pixelSizeX && props.pixelSizeY && props.pixelSizeX / props.pixelSizeY || 1,
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

    const handleIonIntensityChange = async(intensity: number, type: string) => {
      let minScale = state.imageSettings.userScaling[0]
      let maxScale = state.imageSettings.userScaling[1]

      if (type === 'min') {
        minScale = intensity / state.imageSettings.intensity.max.image
        minScale = minScale > 1 ? 1 : minScale
        minScale = minScale > maxScale ? maxScale : minScale
        minScale = minScale < 0 ? 0 : minScale
      } else {
        maxScale = intensity / state.imageSettings.intensity.max.image
        maxScale = maxScale > 1 ? 1 : maxScale
        maxScale = maxScale < 0 ? 0 : maxScale
        maxScale = maxScale < minScale ? minScale : maxScale
      }

      handleUserScalingChange([minScale, maxScale])
    }

    const handleUserScalingChange = async(userScaling: any) => {
      state.imageSettings.userScaling = userScaling

      const minScale =
        state.imageSettings.intensity?.min?.status === 'LOCKED'
          ? userScaling[0] * (1
          - (state.imageSettings.intensity.min.user / state.imageSettings.intensity.max.image))
          + (state.imageSettings.intensity.min.user / state.imageSettings.intensity.max.image)
          : userScaling[0]

      const maxScale = userScaling[1] * (state.imageSettings.intensity?.max?.status === 'LOCKED'
        ? state.imageSettings.intensity.max.user / state.imageSettings.intensity.max.image : 1)
      const scale : [number, number] = [minScale, maxScale]
      state.imageSettings.imageScaledScaling = scale

      Vue.set(state.imageSettings, 'intensity', {
        ...state.imageSettings.intensity,
        min:
          {
            ...state.imageSettings.intensity?.min,
            scaled:
              state.imageSettings.intensity?.min?.status === 'LOCKED'
              && state.imageSettings.intensity.max.image * userScaling[0]
              < state.imageSettings.intensity.min.user
                ? state.imageSettings.intensity.min.user
                : state.imageSettings.intensity.max.image * userScaling[0],
          },
        max:
          {
            ...state.imageSettings.intensity.max,
            scaled:

              state.imageSettings.intensity?.max?.status === 'LOCKED'
              && state.imageSettings.intensity.max.image * userScaling[1]
              > state.imageSettings.intensity.max.user
                ? state.imageSettings.intensity.max.user
                : state.imageSettings.intensity.max.image * userScaling[1],
          },
      })
    }

    const handleIonIntensityLockChange = async(value: number, type: string) => {
      const minLocked = type === 'min' ? value : state.imageSettings.lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.imageSettings.lockedIntensities[1]
      const lockedIntensities : [number | undefined, number | undefined] = [minLocked, maxLocked]
      const intensity : any = getIntensity(state.ionImage,
        lockedIntensities)

      if (intensity && intensity.max && maxLocked && intensity.max.status === 'LOCKED') {
        intensity.max.scaled = maxLocked
        intensity.max.user = maxLocked
        intensity.max.clipped = maxLocked
      }

      if (intensity && intensity.min && minLocked && intensity.min.status === 'LOCKED') {
        intensity.min.scaled = minLocked
        intensity.min.user = minLocked
        intensity.min.clipped = minLocked
      }

      if (intensity && intensity.min && intensity.min.status !== 'LOCKED'
      ) {
        state.imageSettings.imageScaledScaling = [0, state.imageSettings.imageScaledScaling[1]]
      }
      if (intensity && intensity.max && intensity.max.status !== 'LOCKED') {
        state.imageSettings.imageScaledScaling = [state.imageSettings.imageScaledScaling[0], 1]
      }

      state.imageSettings.lockedIntensities = lockedIntensities
      state.imageSettings.intensity = intensity
      state.imageSettings.userScaling = [0, 1]
    }

    const setIonImage = async() => {
      if (ionImageUrl.value) {
        const ionImagePng = await loadPngFromUrl(ionImageUrl.value)
        const isotopeImage = get(annotation.value, 'isotopeImages[0]')
        const { minIntensity, maxIntensity } = isotopeImage
        state.ionImage = await processIonImage(ionImagePng, minIntensity, maxIntensity,
          state.imageSettings.scaleType, undefined, undefined
          , state.imageSettings.isNormalized ? props.normalizationData : null)
        state.imageSettings.intensity = getIntensity(state.ionImage)
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
    }

    const handleScaleBarColorChange = (color: string) => {
      state.imageSettings.scaleBarColor = color
    }

    const handleNormalizationChange = (isNormalized: boolean) => {
      emit('normalization', isNormalized)
      state.imageSettings.isNormalized = props.isNormalized || isNormalized
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
      const gradient = scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : ionImage ? `url(${renderScaleBar(ionImage, cmap, true)})` : ''

      state.imageSettings.colorBar = {
        minColor,
        maxColor,
        gradient,
      }

      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * minScale))
      const maxStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * maxScale))
      state.rangeSliderStyle = {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const getIntensityData = (
      image: number, clipped: number, scaled: number, user: number, quantile: number, isLocked?: boolean,
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
          minIntensity, maxIntensity,
          clippedMinIntensity, clippedMaxIntensity,
          scaledMinIntensity, scaledMaxIntensity,
          userMinIntensity, userMaxIntensity,
          lowQuantile, highQuantile,
        } = ionImage || {}
        const [lockedMin, lockedMax] = lockedIntensities

        return {
          min: getIntensityData(
            minIntensity,
            clippedMinIntensity,
            scaledMinIntensity,
            userMinIntensity,
            lowQuantile,
            lockedMin !== undefined,
          ),
          max: getIntensityData(
            maxIntensity,
            clippedMaxIntensity,
            scaledMaxIntensity,
            userMaxIntensity,
            highQuantile,
            lockedMax !== undefined,
          ),
        }
      }
      return null
    }

    const startImageLoaderSettings = () => {
      state.imageSettings = {
        isNormalized: props.isNormalized || !!$route.query.norm,
        lockedIntensities: [undefined, undefined],
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
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio ? 1
          : props.pixelSizeX && props.pixelSizeY && props.pixelSizeX / props.pixelSizeY || 1,
      }
      setIonImage()
    }

    watch(() => props.isNormalized, (newValue) => {
      handleNormalizationChange(newValue)
    })

    return () => {
      return (
        <div class={'simple-ion-image-container'}>
          {
            state.imageSettings
            && <MainImageHeader
              class='simple-ion-image-item-header dom-to-image-hidden'
              annotation={annotation.value}
              hideTitle
              isActive={false}
              showOpticalImage={false}
              toggleOpticalImage={(e: any) => { }}
              resetViewport={startImageLoaderSettings}
              hasOpticalImage={false}
              colormap={state.imageSettings.colormap}
              onColormapChange={handleColormapChange}
              scaleType={state.imageSettings.scaleType}
              onScaleTypeChange={handleScaleTypeChange}
              onScaleBarColorChange={handleScaleBarColorChange}
              onNormalizationChange={handleNormalizationChange}
            />
          }
          {
            annotation.value
            && state.imageSettings
            && <div class='relative'>
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
                {...{ on: { 'pixel-select': handlePixelSelect } }}
              />
              <div class="ds-viewer-controls-wrapper  v-rhythm-3 sm-side-bar">
                <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                  <div
                    class="range-slider p-3 bg-gray-100 rounded-lg box-border shadow-xs">
                    {
                      state.imageSettings.userScaling
                      && state.rangeSliderStyle
                      && <RangeSlider
                        class="ds-comparison-opacity-item"
                        value={state.imageSettings.userScaling}
                        min={0}
                        max={1}
                        step={0.1}
                        style={state.rangeSliderStyle}
                        onInput={throttle((userScaling : any) => { handleUserScalingChange(userScaling) }, 1000)}
                      />
                    }
                    {
                      state.imageSettings.intensity
                      && <div
                        class="ds-intensities-wrapper">
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
                    }
                  </div>
                </FadeTransition>
              </div>
            </div>
          }
        </div>
      )
    }
  },
})
