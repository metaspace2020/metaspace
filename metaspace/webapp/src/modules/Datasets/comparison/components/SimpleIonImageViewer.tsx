import { computed, defineComponent, onMounted, reactive, ref, watch } from '@vue/composition-api'
import './SimpleIonImageViewer.scss'
import IonImageViewer from '../../../../components/IonImageViewer'
import fitImageToArea, { FitImageToAreaResult } from '../../../../lib/fitImageToArea'
import { ImagePosition } from '../../../ImageViewer/ionImageState'
import { loadPngFromUrl, processIonImage, renderScaleBar } from '../../../../lib/ionImageRendering'
import config from '../../../../lib/config'
import createColormap from '../../../../lib/createColormap'
import Vue from 'vue'
import safeJsonParse from '../../../../lib/safeJsonParse'
import ImageSaver from '../../../ImageViewer/ImageSaver.vue'
import { Input } from '../../../../lib/element-ui'

interface SimpleIonImageViewerProps {
  isActive: boolean
  resetViewPort: boolean
  isNormalized: boolean
  showOpticalImage: boolean
  normalizationData: any
  width: number
  height: number
  annotations: any[]
  scaleType: string
  scaleBarColor: string
  colormap: string
}

interface ImageSettings {
  intensity: any
  ionImagePng: any
  pixelSizeX: number
  pixelSizeY: number
  ionImageLayers: any
  imageFit: Readonly<FitImageToAreaResult>
  lockedIntensities: [number | undefined, number | undefined]
  annotImageOpacity: number
  opticalOpacity: number
  imagePosition: ImagePosition,
  pixelAspectRatio: number
  imageZoom: number
  showOpticalImage: boolean
  userScaling: [number, number],
  imageScaledScaling: [number, number],
  scaleBarUrl: Readonly<string[]>,
}

interface SimpleIonImageViewerState {
  mode: string
  imageSettings: ImageSettings | any,
  colorSettings: any
  ionImagePng: any
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

export const SimpleIonImageViewer = defineComponent<SimpleIonImageViewerProps>({
  name: 'SimpleIonImageViewer',
  props: {
    annotations: { type: Array },
    isActive: { type: Boolean, required: false, default: false },
    width: { type: Number, required: false },
    height: { type: Number, required: false },
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
    showOpticalImage: {
      type: Boolean,
      default: true,
    },
    isNormalized: {
      type: Boolean,
      default: false,
    },
    resetViewPort: {
      type: Boolean,
      default: false,
    },
    normalizationData: {
      type: Object,
      default: null,
    },
  },
  setup(props, { emit }) {
    const state = reactive<SimpleIonImageViewerState>({
      mode: props.isActive ? 'MULTI' : 'SINGLE',
      imageSettings: {},
      colorSettings: {},
      ionImagePng: null,
    })

    const container = ref(null)

    onMounted(() => {
      console.log('start')
      startImageSettings()
    })

    // reset view port globally
    watch(() => props.resetViewPort, (newValue) => {
      if (newValue) {
        emit('resetViewPort', false)
        resetViewPort()
      }
    })

    const resetViewPort = () => {
      if (state.imageSettings) {
        state.imageSettings!.imagePosition = defaultImagePosition()
      }
    }

    const getMetadata = (annotation: any) => {
      const datasetMetadataExternals = {
        Submitter: annotation.dataset.submitter,
        PI: annotation.dataset.principalInvestigator,
        Group: annotation.dataset.group,
        Projects: annotation.dataset.projects,
      }
      return Object.assign(safeJsonParse(annotation.dataset.metadataJson), datasetMetadataExternals)
    }

    const ionImage = (ionImagePng: any, isotopeImage: any,
      scaleType: any = 'linear', userScaling: any = [0, 1], normalizedData: any = null) => {
      if (!isotopeImage || !ionImagePng) {
        return null
      }
      const { minIntensity, maxIntensity } = isotopeImage
      return processIonImage(ionImagePng, minIntensity, maxIntensity, scaleType
        , userScaling, undefined, normalizedData)
    }

    const ionImageLayers = () => {
      const { annotations, isNormalized, normalizationData } = props
      const { imageSettings, colorSettings } = state

      if (annotations === null || annotations[0] === null || imageSettings == null || colorSettings === null) {
        return []
      }

      const ionImages = []

      for (let index = 0; index < annotations?.length; index++) {
        const annotation = annotations[index]
        const ionImagePng = state.ionImagePng[index]

        const finalImage = ionImage(ionImagePng,
          annotation.isotopeImages[0],
          props.scaleType, imageSettings.imageScaledScaling,
          isNormalized && normalizationData
            ? normalizationData : null)
        const hasOpticalImage = annotation.dataset.opticalImages[0]?.url !== undefined

        if (finalImage) {
          ionImages.push({
            ionImage: finalImage,
            colorMap: createColormap(colorSettings[annotation.id].value,
              hasOpticalImage && props.showOpticalImage
                ? 'linear' : 'constant',
              hasOpticalImage && index === 0 && props.showOpticalImage
                ? (imageSettings.annotImageOpacity || 1) : 1),
          })
        }
      }

      return ionImages.filter((a: any) => a !== null)
    }

    const scaleBars = () => {
      const { annotations } = props
      const { imageSettings, colorSettings } = state

      return annotations.map((annotation: any, index: number) => {
        return renderScaleBar(
          imageSettings.ionImageLayers[index]?.ionImage,
          createColormap(props.colormap),
          true,
        )
      })
    }

    const imageFit = () => {
      const { imageSettings } = state
      const { width = props.width, height = props.height } = imageSettings?.ionImagePng || {}

      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / (imageSettings?.pixelAspectRatio || 1),
        areaWidth: props.width,
        areaHeight: props.height,
      })
    }

    const defaultImagePosition = () => ({
      // This is a function so that it always makes a separate copy for each image
      zoom: 1,
      xOffset: 0,
      yOffset: 0,
    })

    const startImageSettings = async() => {
      const { annotations, isActive } = props
      const annotation = annotations[0]
      const ionImagesPng = []

      const metadata = getMetadata(annotation)
      // eslint-disable-next-line camelcase
      const pixelSizeX = metadata?.MS_Analysis?.Pixel_Size?.Xaxis || 0
      // eslint-disable-next-line camelcase
      const pixelSizeY = metadata?.MS_Analysis?.Pixel_Size?.Yaxis || 0

      for (let i = 0; i < annotations?.length; i++) {
        const annotationItem = annotations[i]
        state.colorSettings[annotationItem.id] = computed(() => isActive
          ? props.colormap : Object.keys(channels)[i % Object.keys(channels).length])
        const ionImagePng = await loadPngFromUrl(annotationItem.isotopeImages[0].url)
        ionImagesPng.push(ionImagePng)
      }

      state.ionImagePng = ionImagesPng

      const imageSettings : ImageSettings = reactive({
        intensity: null, // @ts-ignore // Gets set later, because ionImageLayers needs state.gridState[key] set
        ionImagePng: ionImagesPng[0],
        pixelSizeX,
        pixelSizeY,
        // ionImageLayers and imageFit rely on state.gridState[key] to be correctly set - avoid evaluating them
        // until this has been inserted into state.gridState
        ionImageLayers: computed(() => ionImageLayers()),
        imageFit: computed(() => imageFit()),
        lockedIntensities: [undefined, undefined],
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        imagePosition: defaultImagePosition(),
        pixelAspectRatio:
            config.features.ignore_pixel_aspect_ratio ? 1
              : pixelSizeX && pixelSizeY && pixelSizeX / pixelSizeY || 1,
        imageZoom: 1,
        showOpticalImage: props.showOpticalImage,
        userScaling: [0, 1],
        imageScaledScaling: [0, 1],
        scaleBarUrl: computed(() => scaleBars()),
      })
      Vue.set(state, 'imageSettings', imageSettings)
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any) => {
      const gridCell = state.imageSettings
      if (gridCell != null) {
        gridCell.imagePosition.zoom = zoom / gridCell.imageFit.imageZoom
        gridCell.imagePosition.xOffset = xOffset
        gridCell.imagePosition.yOffset = yOffset
      }
    }

    return () => {
      const { width, height, annotations } = props
      const { imageSettings } = state

      if (!imageSettings || !imageSettings.ionImageLayers
        || imageSettings.ionImageLayers.length === 0 || !annotations) {
        return null
      }

      return (
        <div
          ref={container}
          class={'ds-simple-ion-image-container relative'}
          style={{
            width,
            height,
          }}
        >
          <IonImageViewer
            height={height}
            width={width}
            zoom={imageSettings!.imagePosition?.zoom
              * imageSettings!.imageFit?.imageZoom}
            xOffset={imageSettings!.imagePosition?.xOffset || 0}
            yOffset={imageSettings!.imagePosition?.yOffset || 0}
            isLoading={false}
            ionImageLayers={imageSettings!.ionImageLayers}
            scaleBarColor={props.scaleBarColor}
            scaleType={props.scaleType}
            pixelSizeX={imageSettings!.pixelSizeX}
            pixelSizeY={imageSettings!.pixelSizeY}
            pixelAspectRatio={imageSettings!.pixelAspectRatio}
            opticalOpacity={imageSettings!.opticalOpacity}
            imageHeight={imageSettings!.ionImageLayers[0]?.ionImage?.height }
            imageWidth={imageSettings!.ionImageLayers[0]?.ionImage?.width }
            minZoom={imageSettings!.imageFit.imageZoom / 4}
            maxZoom={imageSettings!.imageFit.imageZoom * 20}
            opticalSrc={props.showOpticalImage
              ? annotations[0]?.dataset?.opticalImages[0]?.url
              : undefined}
            opticalTransform={props.showOpticalImage
              ? annotations[0]?.dataset?.opticalImages[0]?.transform
              : undefined}
            scrollBlock
            showPixelIntensity
            onMove={handleImageMove}
          />
          <ImageSaver
            class="absolute top-0 left-0 mt-3 ml-3 dom-to-image-hidden"
            domNode={container.value}
          />
        </div>
      )
    }
  },
})
