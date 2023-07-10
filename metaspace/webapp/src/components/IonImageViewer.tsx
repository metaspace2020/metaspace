import Vue from 'vue'
import { computed, defineComponent, onMounted, onUpdated, reactive, ref, watch } from '@vue/composition-api'
import { Ref, SetupContext } from '@vue/composition-api'

import { getOS, scrollDistance, WheelEventCompat } from '../lib/util'
import config from '../lib/config'
import { renderIonImages, IonImageLayer } from '../lib/ionImageRendering'
import ScaleBar from './ScaleBar.vue'
import { debounce, throttle } from 'lodash-es'
import { ReferenceObject } from 'popper.js'
import { templateRef } from '../lib/templateRef'

const formatMatrix3d = (t: readonly number[][]) =>
  `matrix3d(${t[0][0]}, ${t[1][0]}, 0, ${t[2][0]},
             ${t[0][1]}, ${t[1][1]}, 0, ${t[2][1]},
                      0,          0, 1,          0,
             ${t[0][2]}, ${t[1][2]}, 0, ${t[2][2]})`

interface Props {
  roiInfo: any[];
  ionImageLayers: IonImageLayer[]
  isLoading: boolean
  // width & height of HTML element
  width: number
  height: number
  // width & height of image, useful when layers are hidden
  imageWidth?: number
  imageHeight?: number
  // zoom factor where 1.0 means 1 ion image pixel per browser pixel
  zoom: number
  minZoom: number
  maxZoom: number
  // x & y coordinates to offset the center of the image in ion image pixel units. As long as these remain constant
  // the ion image pixel at the center will stay in the same place regardless of zoom level.
  // xOffset=0, yOffset=0 will center the ion image.
  xOffset: number
  yOffset: number
  opticalSrc: string | null
  opticalOpacity: number
  ionImageTransform: number[][]
  opticalTransform: number[][]
  scrollBlock: boolean
  keepPixelSelected: boolean
  pixelSizeX: number
  pixelSizeY: number
  pixelAspectRatio: number
  scaleBarColor: string
  showPixelIntensity: boolean
  showNormalizedIntensity: boolean
  normalizationData: any
}

const useScrollBlock = () => {
  const state = reactive({
    tmId: null as any,
    overlayFadingIn: false,
  })

  const messageOS = computed(() => {
    const os = getOS()

    if (os === 'Linux' || os === 'Windows') {
      return 'CTRL + scroll the mouse wheel'
    } else if (os === 'Mac OS') {
      return 'CMD ⌘ + scroll the mouse wheel'
    } else if (os === 'Android' || os === 'iOS') {
      return 'two fingers'
    } else {
      return 'CTRL + scroll wheel'
    }
  })

  const showScrollBlock = () => {
    state.overlayFadingIn = true
    if (state.tmId !== 0) {
      clearTimeout(state.tmId)
    }
    state.tmId = setTimeout(() => {
      state.overlayFadingIn = false
    }, 1100)
  }
  const renderScrollBlock = () => (<div
    class={{
      'absolute inset-0 z-30 pointer-events-none bg-body flex items-center justify-center': true,
      'opacity-0 duration-1000': !state.overlayFadingIn,
      'opacity-75 duration-700': state.overlayFadingIn,
    }}
  >
    <p class="relative block z-40 m-0 text-white text-2xl">
      Use { messageOS.value } to zoom the image
    </p>
  </div>)

  return { showScrollBlock, renderScrollBlock }
}

const useScaleBar = (props: Props) => {
  const xScale = computed(() => {
    if (props.pixelSizeX != null && props.pixelSizeX !== 0) {
      return props.pixelSizeX / props.zoom
    } else {
      return 1
    }
  })
  const yScale = computed(() => {
    if (props.pixelSizeY != null && props.pixelSizeY !== 0) {
      return props.pixelSizeY / props.zoom * props.pixelAspectRatio
    } else {
      return 1
    }
  })

  const renderScaleBar = () => {
    return props.scaleBarColor && <ScaleBar
      x-scale={xScale.value}
      y-scale={yScale.value}
      scale-bar-color={props.scaleBarColor}
    />
  }
  return { renderScaleBar }
}

const usePixelIntensityDisplay = (
  props: Props,
  imageLoaderRef: Ref<ReferenceObject | null>,
  emit: (event: string, ...args: any[]) => void,
) => {
  const pixelIntensityTooltipRef = templateRef<any>('pixelIntensityTooltip')
  const cursorPixelPos = ref<[number, number] | null>(null)
  const zoomX = computed(() => props.zoom)
  const zoomY = computed(() => props.zoom / props.pixelAspectRatio)
  const cursorOverLayers = computed(() => {
    const layers = []
    const TIC_MULTIPLIER = 1000000
    if (props.ionImageLayers.length && cursorPixelPos.value != null) {
      const [x, y] = cursorPixelPos.value
      for (const { ionImage, colorMap } of props.ionImageLayers) {
        const { width, height, mask, intensityValues } = ionImage
        if (x >= 0 && x < width
          && y >= 0 && y < height
          && mask[y * width + x] !== 0) {
          const idx = y * width + x
          const [r, g, b] = colorMap[colorMap.length - 1]
          layers.push({
            intensity: (props.showNormalizedIntensity ? ((intensityValues[idx] / TIC_MULTIPLIER)
              * props.normalizationData?.data?.[idx]) : intensityValues[idx]).toExponential(1),
            normalizedIntensity: intensityValues[idx].toExponential(1),
            color: props.ionImageLayers.length > 1 ? `rgb(${r},${g},${b})` : null,
          })
        }
      }
    }
    return layers
  })
  const pixelIntensityStyle = computed(() => {
    if (props.showPixelIntensity
      && props.ionImageLayers.length
      && cursorPixelPos.value != null
      && cursorOverLayers.value.length) {
      const { width, height } = props.ionImageLayers[0].ionImage
      const baseX = props.width / 2 + (props.xOffset - width / 2) * zoomX.value
      const baseY = props.height / 2 + (props.yOffset - height / 2) * zoomY.value
      const [cursorX, cursorY] = cursorPixelPos.value
      return {
        left: (baseX + cursorX * zoomX.value - 0.5) + 'px',
        top: (baseY + cursorY * zoomY.value - 0.5) + 'px',
        width: `${zoomX.value - 0.5}px`,
        height: `${zoomY.value - 0.5}px`,
      }
    } else {
      return null
    }
  })

  const updatePixelIntensity = throttle(() => {
    // WORKAROUND: el-tooltip and el-popover don't correctly open if they're mounted in an already-visible state
    // Calling updatePopper causes it to refresh its visibility
    if (pixelIntensityTooltipRef.value != null) {
      pixelIntensityTooltipRef.value.updatePopper()
    }
  })
  watch(pixelIntensityStyle, () => {
    Vue.nextTick(updatePixelIntensity)
  })

  const movePixelIntensity = (clientX: number | null, clientY: number | null, updatePixel: boolean = false) => {
    if (imageLoaderRef.value != null && props.ionImageLayers.length && clientX != null && clientY != null) {
      const rect = imageLoaderRef.value.getBoundingClientRect()
      const { width = 0, height = 0 } = props.ionImageLayers[0].ionImage
      // Includes a 2px offset up and left so that the selected pixel is less obscured by the mouse cursor
      const x = Math.floor((clientX - (rect.left + rect.right) / 2 - 2)
        / zoomX.value - props.xOffset + width / 2)
      const y = Math.floor((clientY - (rect.top + rect.bottom) / 2 - 2)
        / zoomY.value - props.yOffset + height / 2)

      if (!props.keepPixelSelected) {
        cursorPixelPos.value = [x, y]
      } else if (
        updatePixel && props.keepPixelSelected
        && x >= 0 && y >= 0 && y < props.ionImageLayers[0].ionImage.height
        && x < props.ionImageLayers[0].ionImage.width
      ) { // check if pixel pos should update and if it is inside ionImage boundary
        cursorPixelPos.value = [x, y]
        emit('pixel-select', { x: cursorPixelPos.value[0], y: cursorPixelPos.value[1] })
      }
    } else {
      cursorPixelPos.value = null
    }
  }

  const renderPixelIntensity = () => pixelIntensityStyle.value != null
    ? <div>
      <el-tooltip
        ref="pixelIntensityTooltip"
        manual={true}
        value={true}
        popper-class="pointer-events-none"
        placement="top"
      >
        {cursorOverLayers.value?.length > 1
          ? <ul slot="content" class="list-none p-0 m-0">
            {cursorOverLayers.value?.map(({ intensity, color, normalizedIntensity }) =>
              <li class="flex leading-5 items-center">
                { color && <i
                  class="w-3 h-3 border border-solid border-gray-400 box-border mr-1 rounded-full"
                  style={{ background: color }}
                /> }
                <div class='flex flex-col leading-snug'>
                  <div>
                    {
                      props.showNormalizedIntensity
                    && <span>Intensity: </span>
                    }
                    <span>{intensity}</span>
                  </div>
                  {
                    props.showNormalizedIntensity
                  && <div class='mb-1'>
                    <span>TIC-relative intensity: </span>
                    <span>
                      {normalizedIntensity}
                    </span>
                  </div>
                  }
                </div>
              </li>
            )}
          </ul>
          : <div slot="content" class='flex flex-col'>
            <div>
              {
                props.showNormalizedIntensity
                && <span>Intensity: </span>
              }
              <span>{cursorOverLayers.value?.[0].intensity}</span>
            </div>
            {
              props.showNormalizedIntensity
              && <div>
                <span>TIC-relative intensity: </span>
                <span>
                  {cursorOverLayers.value?.[0].normalizedIntensity}
                </span>
              </div>
            }
          </div> }
        <div
          style={pixelIntensityStyle.value}
          class="absolute block border-solid z-30 pointer-events-none box-border"
        />
      </el-tooltip>
    </div>
    : null
  return {
    movePixelIntensity,
    renderPixelIntensity,
  }
}

const usePanAndZoom = (
  props: Props,
  imageLoaderRef: Ref<ReferenceObject | null>,
  emit: (event: string, ...args: any[]) => void,
  imageSize: Ref<{ width: number, height: number }>,
) => {
  const state = reactive({
    dragStartX: 0,
    dragStartY: 0,
    dragXOffset: 0,
    dragYOffset: 0,
  })
  const zoomX = computed(() => props.zoom)
  const zoomY = computed(() => props.zoom / props.pixelAspectRatio)
  const viewBoxStyle = computed(() => {
    const { width, height } = imageSize.value
    if (width === undefined || height === undefined) {
      return null // should always be scaled to size of image
    }
    const x = props.width / 2 + (props.xOffset - width / 2) * zoomX.value
    const y = props.height / 2 + (props.yOffset - height / 2) * zoomY.value
    return {
      left: 0,
      top: 0,
      width: props.width + 'px',
      height: props.height + 'px',
      transformOrigin: '0 0',
      transform: `translate(${x}px, ${y}px) scale(${zoomX.value}, ${zoomY.value})`,
    }
  })

  const handleZoom = (sY: number, clientX: number, clientY: number) => {
    if (imageLoaderRef.value != null) {
      const newZoomX = Math.max(props.minZoom, Math.min(props.maxZoom, props.zoom - props.zoom * sY / 10.0))
      const newZoomY = newZoomX / props.pixelAspectRatio
      const rect = imageLoaderRef.value.getBoundingClientRect()

      // Adjust the offsets so that the pixel under the mouse stays still while the image expands around it
      const mouseXOffset = (clientX - (rect.left + rect.right) / 2) / zoomX.value
      const mouseYOffset = (clientY - (rect.top + rect.bottom) / 2) / zoomY.value
      const xOffset = props.xOffset + mouseXOffset * (zoomX.value / newZoomX - 1)
      const yOffset = props.yOffset + mouseYOffset * (zoomY.value / newZoomY - 1)

      emit('move', { zoom: newZoomX, xOffset, yOffset })
    }
  }

  const handlePanStart = (event: MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault()
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
      state.dragXOffset = props.xOffset
      state.dragYOffset = props.yOffset
      document.addEventListener('mouseup', handlePanEnd)
      document.addEventListener('mousemove', handlePan)
    }
  }

  const handlePanEnd = (event: MouseEvent) => {
    const xOffset = state.dragXOffset + (event.clientX - state.dragStartX) / zoomX.value
    const yOffset = state.dragYOffset + (event.clientY - state.dragStartY) / zoomY.value
    emit('move', { zoom: props.zoom, xOffset, yOffset })
    document.removeEventListener('mouseup', handlePanEnd)
    document.removeEventListener('mousemove', handlePan)
    state.dragStartX = 0
    state.dragStartY = 0
  }

  const handlePan = (event: MouseEvent) => {
    if (state.dragStartX === null) {
      return
    }

    const xOffset = state.dragXOffset + (event.clientX - state.dragStartX) / zoomX.value
    const yOffset = state.dragYOffset + (event.clientY - state.dragStartY) / zoomY.value
    emit('move', { zoom: props.zoom, xOffset, yOffset })
  }
  return { viewBoxStyle, handleZoom, handlePanStart }
}

const useBufferedOpticalImage = (props: Props) => {
  const opticalImageStyle = computed(() => ({
    transform: (props.opticalTransform ? formatMatrix3d(props.opticalTransform) : ''),
  }))
  const opticalImageUrl = computed(() => props.opticalSrc ? (config.imageStorage || '') + props.opticalSrc : null)

  const state = reactive({
    // Cache the last loaded optical image so that it doesn't flicker when changing zoom levels
    loadedOpticalImageUrl: props.opticalSrc ? (config.imageStorage || '') + props.opticalSrc : null,
    loadedOpticalImageStyle: {
      transform: (props.opticalTransform ? formatMatrix3d(props.opticalTransform) : ''),
    },
  })
  const onOpticalImageLoaded = () => {
    state.loadedOpticalImageUrl = opticalImageUrl.value
    state.loadedOpticalImageStyle = opticalImageStyle.value
  }
  // The key for the currently loaded image can shift between the two img virtual-DOM nodes, which causes
  // Vue to transfer the real DOM node from one virtual-DOM node to the other. This allows the following code to
  // seamlessly switch between zoom levels that have different images and different transforms.
  // Always test against IE11 when touching this code - IE11's @load event doesn't always fire on img elements.
  const renderOpticalImage = () => (
    <div>
      {opticalImageUrl.value
      && <img
        key={state.loadedOpticalImageUrl}
        crossOrigin="anonymous"
        src={state.loadedOpticalImageUrl}
        class="absolute top-0 left-0 -z-10 origin-top-left"
        style={{
          ...state.loadedOpticalImageStyle,
          filter: props.opticalOpacity !== undefined ? `brightness(${100 - ((1 - props.opticalOpacity) * 100
              * 0.75)}%) grayscale(${(1 - (props.opticalOpacity || 0)) * 100}%)` : '',
        }}
      />}

      {opticalImageUrl.value
      && state.loadedOpticalImageUrl !== opticalImageUrl.value
      && <img
        key={opticalImageUrl.value}
        crossOrigin="anonymous"
        src={opticalImageUrl.value}
        class="absolute top-0 left-0 -z-20 origin-top-left opacity-1"
        style={{
          ...opticalImageStyle.value,
          filter: props.opticalOpacity !== undefined ? `brightness(${100 - ((1 - props.opticalOpacity) * 100
              * 0.75)}%) grayscale(${(1 - (props.opticalOpacity || 0)) * 100}%)` : '',
        }}
        onLoad={onOpticalImageLoaded}
      />}
    </div>)
  return { renderOpticalImage }
}

const useIonImageView = (props: Props, imageSize: Ref<{ width: number, height: number }>,
  imageLoaderRef: Ref<ReferenceObject | null>,
  emit: (event: string, ...args: any[]) => void,
) => {
  const canvasRef = templateRef<HTMLCanvasElement>('ionImageCanvas')

  const renderToCanvas = () => {
    const { width, height } = imageSize.value
    const canvas = canvasRef.value

    if (canvas && width && height) {
      renderIonImages(props.ionImageLayers, canvas, width, height, props.roiInfo)
    }
  }

  const handleMouseDown = (e: any, isFixed: boolean = true) => {
    e.preventDefault()
    e.stopPropagation()

    if (
      props.roiInfo[props.roiInfo.length - 1].isDrawing
      && imageLoaderRef.value != null && props.ionImageLayers.length && e.clientX != null && e.clientY != null) {
      const cursorPixelPos = ref<[number, number] | null>(null)
      const { width = 0, height = 0 } = props.ionImageLayers[0].ionImage
      const zoomX = computed(() => props.zoom)
      const zoomY = computed(() => props.zoom / props.pixelAspectRatio)
      const rect = imageLoaderRef.value.getBoundingClientRect()
      const x = Math.floor((e.clientX - (rect.left + rect.right) / 2)
        / zoomX.value - props.xOffset + width / 2)
      const y = Math.floor((e.clientY - (rect.top + rect.bottom) / 2)
        / zoomY.value - props.yOffset + height / 2)

      cursorPixelPos.value = [x, y]
      emit('roi-coordinate', { x: cursorPixelPos.value[0], y: cursorPixelPos.value[1], isFixed })
    }
  }

  onMounted(renderToCanvas)
  onUpdated(renderToCanvas)

  const renderIonImageView = () => {
    const { width, height } = imageSize.value
    const roiEnabled = Array.isArray(props.roiInfo) && props.roiInfo.length > 0
      && props.roiInfo[props.roiInfo.length - 1].isDrawing

    return (
      <canvas
        ref="ionImageCanvas"
        width={width}
        height={height}
        onmousemove={roiEnabled ? debounce((e) => { handleMouseDown(e, false) }, 100,
          { leading: true }) : () => {}}
        onmousedown={roiEnabled ? debounce(handleMouseDown, 100, { leading: true }) : () => {}}
        class="absolute top-0 left-0 z-10 origin-top-left select-none pixelated"
        style={{
          cursor: props.roiInfo && props.roiInfo.length > 0 && props.roiInfo[props.roiInfo.length - 1].isDrawing
            ? 'crosshair' : '',
          transform: (props.ionImageTransform ? formatMatrix3d(props.ionImageTransform) : ''),
        }}
      />
    )
  }
  return { renderIonImageView }
}

const useImageSize = (props: Props) => {
  const imageSize = computed(() => {
    const [layer] = props.ionImageLayers || []
    const { imageWidth = layer?.ionImage.width, imageHeight = layer?.ionImage.height } = props
    return {
      width: imageWidth,
      height: imageHeight,
    }
  })
  return {
    imageSize,
  }
}

export default defineComponent<Props>({
  name: 'IonImageViewer',
  props: {
    ionImageLayers: Array,
    isLoading: { type: Boolean, default: false },
    // width & height of HTML element
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // width & height of image, useful when layers are hidden
    imageWidth: { type: Number },
    imageHeight: { type: Number },
    // zoom factor where 1.0 means 1 ion image pixel per browser pixel
    zoom: { type: Number, required: true },
    minZoom: { type: Number, default: 0.1 },
    maxZoom: { type: Number, default: 10 },
    // x & y coordinates to offset the center of the image in ion image pixel units. As long as these remain constant
    // the ion image pixel at the center will stay in the same place regardless of zoom level.
    // xOffset=0, yOffset=0 will center the ion image.
    xOffset: { type: Number, required: true },
    yOffset: { type: Number, required: true },
    opticalSrc: { type: String, default: null },
    opticalOpacity: { type: Number, default: 1 },

    // 3x3 matrix mapping ion-image pixel coordinates into new ion-image pixel coordinates independent from
    // zoom/offset props, e.g. This ionImageTransform:
    // [[1, 0, 5],
    //  [0, 1, 3],
    //  [0, 0, 1]]
    // will mean that the pixel in the viewer that previously showed ion image pixel (10, 10) will now show
    // pixel (5, 7) because the ion image has moved (+5, +3) from its original position.
    ionImageTransform: { type: Array },
    opticalTransform: { type: Array },
    scrollBlock: { type: Boolean, default: false },
    keepPixelSelected: { type: Boolean, default: false },
    pixelSizeX: { type: Number, default: 0 },
    pixelSizeY: { type: Number, default: 0 },
    pixelAspectRatio: { type: Number, default: 1 },
    scaleBarColor: { type: String, default: null },
    showPixelIntensity: { type: Boolean, default: false },
    showNormalizedIntensity: { type: Boolean, default: false },
    normalizationData: { type: Object },
    roiInfo: { type: Array, default: () => [] },
  },
  setup(props: Props, { emit }: SetupContext) {
    const imageLoaderRef = templateRef<ReferenceObject>('imageLoader')
    const { showScrollBlock, renderScrollBlock } = useScrollBlock()
    const { renderScaleBar } = useScaleBar(props)

    const { imageSize } = useImageSize(props)
    const { renderPixelIntensity, movePixelIntensity } = usePixelIntensityDisplay(props, imageLoaderRef, emit)
    const { viewBoxStyle, handleZoom, handlePanStart } = usePanAndZoom(props, imageLoaderRef, emit, imageSize)
    const { renderIonImageView } = useIonImageView(props, imageSize, imageLoaderRef, emit)
    const { renderOpticalImage } = useBufferedOpticalImage(props)

    const onWheel = (event: WheelEventCompat) => {
      // TODO: add pinch event handler for mobile devices
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        handleZoom(scrollDistance(event), event.clientX, event.clientY)

        Vue.nextTick(() => {
          movePixelIntensity(event.clientX, event.clientY)
        })
      } else {
        showScrollBlock()
      }
    }

    return () => (
      <div
        ref="imageLoader"
        v-loading={props.isLoading}
        class="relative overflow-hidden"
        style={{ width: props.width + 'px', height: props.height + 'px' }}
        onwheel={onWheel}
        onmousedown={handlePanStart}
        onClick={({ clientX, clientY }: MouseEvent) => {
          if (props.keepPixelSelected) {
            movePixelIntensity(clientX, clientY, true)
          }
        }}
        onmousemove={({ clientX, clientY }: MouseEvent) => {
          if (!props.keepPixelSelected) {
            movePixelIntensity(clientX, clientY)
          }
        }}
      >
        {viewBoxStyle.value
          && <div data-test-key="ion-image-panel" style={viewBoxStyle.value}>
            {renderIonImageView()}
            {renderOpticalImage()}
          </div>}

        {renderPixelIntensity()}

        {renderScaleBar()}

        {props.scrollBlock && renderScrollBlock()}

      </div>
    )
  },
})
