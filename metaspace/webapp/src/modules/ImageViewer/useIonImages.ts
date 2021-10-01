import { ref, Ref, computed, watch } from '@vue/composition-api'
import { Image } from 'upng-js'

import { IonImage, loadPngFromUrl, processIonImage, renderScaleBar } from '../../lib/ionImageRendering'
import { ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import getColorScale from '../../lib/getColorScale'
import reportError from '../../lib/reportError'

import viewerState from './state'
import { Annotation, IonImageLayer, useAnnotations, useIonImageSettings, useIonImageLayers } from './ionImageState'

interface Props {
  annotation: Annotation,
  imageLoaderSettings: any
  colormap: string
  scaleType?: ScaleType
  ticData?: any
}
interface ColorBar {
  minColor: string,
  maxColor: string,
  gradient: string,
}
interface IntensityData {
  image: number,
  clipped: number,
  scaled: number,
  user: number,
  quantile: number,
  status: 'LOCKED' | 'CLIPPED' | undefined,
}

interface ComputedImageData {
  colorBar: Readonly<Ref<Readonly<ColorBar>>>,
  colorMap: Readonly<Ref<Readonly<number[][]>>>,
  image: Readonly<Ref<Readonly<IonImage | null>>>,
  intensity: Readonly<Ref<Readonly<{min: IntensityData, max: IntensityData} | null>>>,
  scaleRange: Readonly<Ref<Readonly<[number, number]>>>,
}

const { annotationCache, onAnnotationChange, activeAnnotation, getImageIntensities } = useAnnotations()
const { lockedIntensities, lockedScaleRange } = useIonImageSettings()
const { layerCache, orderedLayers } = useIonImageLayers()

const rawImageCache : Record<string, Ref<Image | null>> = {}

function getIntensityData(
  image: number, clipped: number, scaled: number, user: number, quantile: number, isLocked?: boolean,
): IntensityData {
  const isClipped = quantile > 0 && quantile < 1 && user === image
  return {
    image,
    clipped,
    scaled,
    user,
    quantile,
    status: isLocked ? 'LOCKED' : isClipped ? 'CLIPPED' : undefined,
  } as const
}

function createComputedImageData(props: Props, layer: IonImageLayer): ComputedImageData {
  if (!(layer.id in rawImageCache)) {
    rawImageCache[layer.id] = ref<Image | null>(null)
  }

  if (rawImageCache[layer.id].value === null) {
    const annotation = annotationCache[layer.id]
    const [isotopeImage] = annotation.isotopeImages
    if (isotopeImage && isotopeImage.url) {
      loadPngFromUrl(isotopeImage.url).then(img => {
        rawImageCache[layer.id].value = img
      })
        .catch(err => {
          reportError(err, null)
        })
    }
  }

  const activeState = computed(() =>
    viewerState.mode.value === 'SINGLE' ? layer.singleModeState : layer.multiModeState,
  )

  const userIntensities = computed(() => {
    const { minIntensity, maxIntensity } = activeState.value
    const [min = minIntensity, max = maxIntensity] = lockedIntensities.value
    return [min, max] as [number, number]
  })

  const scaleRange = computed(() => {
    const [userMin, userMax] = activeState.value.scaleRange
    const [lockedMin, lockedMax] = lockedScaleRange.value
    return [
      lockedMin === undefined ? userMin : Math.min(lockedMin, userMax),
      lockedMax === undefined ? userMax : Math.max(lockedMax, userMin),
    ] as [number, number]
  })

  const image = computed(() => {
    const raw = rawImageCache[layer.id]
    if (raw.value !== null) {
      const annotation = annotationCache[layer.id]

      const { minIntensity, maxIntensity } = getImageIntensities(annotation)

      return processIonImage(
        raw.value,
        minIntensity,
        maxIntensity,
        props.scaleType,
        scaleRange.value,
        userIntensities.value,
        props.ticData,
      )
    }
    return null
  })

  const activeColorMap = computed(() => viewerState.mode.value === 'SINGLE'
    ? props.colormap as string
    : layer.settings.channel,
  )

  const colorMap = computed(() => {
    const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
    return createColorMap(activeColorMap.value, opacityMode, annotImageOpacity)
  })

  const colorBar = computed(() => {
    const colorMap = createColorMap(activeColorMap.value)
    const { range } = getColorScale(activeColorMap.value)
    const { scaledMinIntensity, scaledMaxIntensity } = image.value || {}
    return {
      minColor: range[0],
      maxColor: range[range.length - 1],
      gradient: scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : image.value ? `url(${renderScaleBar(image.value, colorMap, true)})` : '',
    }
  })

  const intensity = computed(() => {
    if (image.value !== null) {
      const {
        minIntensity, maxIntensity,
        clippedMinIntensity, clippedMaxIntensity,
        scaledMinIntensity, scaledMaxIntensity,
        userMinIntensity, userMaxIntensity,
        lowQuantile, highQuantile,
      } = image.value || {}
      const [lockedMin, lockedMax] = lockedIntensities.value
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
  })

  return {
    colorBar,
    colorMap,
    image,
    intensity,
    scaleRange,
  }
}

const useIonImages = (props: Props) => {
  const computedImageDataCache = new WeakMap<IonImageLayer, ComputedImageData>()

  const ionImagesWithData = computed(() => {
    let layers
    if (viewerState.mode.value === 'SINGLE') {
      layers = (activeAnnotation.value ? [layerCache[activeAnnotation.value]] : [])
    } else {
      layers = orderedLayers.value
    }
    return layers.map(layer => {
      let data = computedImageDataCache.get(layer)
      if (data == null) {
        data = createComputedImageData(props, layer)
        computedImageDataCache.set(layer, data)
      }
      return { layer, data }
    })
  })

  const ionImagesLoading = computed(
    () => ionImagesWithData.value.some(({ data }) => data.image.value === null),
  )

  const ionImageLayers = computed(() => {
    if (viewerState.mode.value === 'SINGLE') {
      if (ionImagesWithData.value.length) {
        const { image, colorMap } = ionImagesWithData.value[0].data
        if (image.value !== null) {
          return [{
            ionImage: image.value,
            colorMap: colorMap.value,
          }]
        }
      }
      return []
    }

    const layers = []
    for (const { layer, data } of ionImagesWithData.value) {
      const { image, colorMap } = data
      if (image.value !== null && layer.settings.visible) {
        layers.push({
          ionImage: image.value,
          colorMap: colorMap.value,
        })
      }
    }
    return layers
  })

  const singleIonImageControls = computed(() => {
    if (ionImagesWithData.value.length) {
      const { layer, data } = ionImagesWithData.value[0]
      return {
        colorBar: data.colorBar,
        intensity: data.intensity,
        scaleRange: data.scaleRange,
        state: layer.singleModeState,
      }
    }
    return null
  })

  const ionImageMenuItems = computed(() => {
    const items = []
    for (const { layer, data } of ionImagesWithData.value) {
      items.push({
        loading: data.image.value === null,
        annotation: annotationCache[layer.id],
        colorBar: data.colorBar,
        id: layer.id,
        intensity: data.intensity,
        scaleRange: data.scaleRange,
        settings: layer.settings,
        state: layer.multiModeState,
        toggleVisibility() {
          const { settings } = layer
          settings.visible = !settings.visible
        },
      })
    }
    return items
  })

  const ionImageDimensions = computed(() => {
    const images = ionImagesWithData.value
    if (images.length) {
      const firstImage = images[0]
      const computedImage = firstImage.data.image.value
      if (computedImage) {
        return {
          width: computedImage.width,
          height: computedImage.height,
        }
      }
    }
    return { width: undefined, height: undefined }
  })

  watch(() => props.annotation, onAnnotationChange)

  return {
    ionImageLayers,
    ionImageMenuItems,
    singleIonImageControls,
    ionImagesLoading,
    ionImageDimensions,
  }
}

export default useIonImages
