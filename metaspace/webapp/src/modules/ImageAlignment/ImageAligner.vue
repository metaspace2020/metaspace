<template>
  <div class="image-alignment-box" @mousemove="onMouseMove">
    <div v-loading="!opticalImageNaturalHeight" class="optical-img-container" style="border: 1px solid #ddf">
      <img ref="scan" :src="opticalSrc" :style="opticalImageStyle" @load="onOpticalImageLoad" />
    </div>

    <div class="handles-container">
      <svg ref="handles" :width="svgWidth" :height="svgHeight" :style="handleLayerStyle">
        <g v-if="!isNaN(scaleX * scaleY)" :transform="layerTransform">
          <g v-if="fineTune">
            <circle
              v-for="(pos, idx) in handlePositions"
              :key="idx"
              class="handle"
              :cx="pos.x * scaleX + padding"
              :cy="pos.y * scaleY + padding"
              r="7"
              @mousedown="onMouseDown($event, idx)"
            />
          </g>

          <!-- draw a cross showing the center of the original image -->
          <line
            :x1="centerPosition.x * scaleX + padding - 10"
            :x2="centerPosition.x * scaleX + padding + 10"
            :y1="centerPosition.y * scaleY + padding + 10"
            :y2="centerPosition.y * scaleY + padding - 10"
            class="cross"
          />
          <line
            :x1="centerPosition.x * scaleX + padding - 10"
            :x2="centerPosition.x * scaleX + padding + 10"
            :y1="centerPosition.y * scaleY + padding - 10"
            :y2="centerPosition.y * scaleY + padding + 10"
            class="cross"
          />
        </g>
      </svg>
    </div>

    <image-loader
      ref="annotImage"
      :src="ionImageSrc"
      :style="annotImageStyle"
      :image-style="{ overflow: 'visible' }"
      :image-fit-params="{ areaWidth: naturalWidth || 1, areaHeight: naturalHeight || 1 }"
      :max-height="100500"
      :annot-image-opacity="annotImageOpacity"
      :ion-image-transform="ionImageTransform"
      :normalization-data="normalizationData"
      opacity-mode="linear"
      @dblclick="onDoubleClick"
      @mousedown="onImageMouseDown"
      @contextmenu="onImageRightMouseDown"
      @wheel="onWheel"
      @redraw="onLoad"
    />
  </div>
</template>

<script>
import { defineComponent, ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, toRefs } from 'vue'
import ImageLoader from '../../components/ImageLoader.vue'
import { scrollDistance } from '../../lib/util'

export default defineComponent({
  name: 'ImageAligner',
  components: {
    ImageLoader,
  },
  props: {
    opticalSrc: {
      // URL of an optical image
      type: String,
    },
    ionImageSrc: {
      // URL of a grayscale image
      type: String,
    },
    annotImageOpacity: {
      type: Number,
      default: 1,
    },
    padding: {
      type: Number,
      default: 100,
    },
    rotationAngleDegrees: {
      type: Number,
      default: 0,
    },
    initialTransform: {
      type: Array,
      default: () => [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    ticData: { type: Object },
  },
  setup(props, { emit }) {
    const state = reactive({
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0,
      opticalImageWidth: 0,
      opticalImageHeight: 0,
      opticalImageNaturalWidth: 0,
      opticalImageNaturalHeight: 0,
      draggedHandle: null, // index of the handle being dragged
      handleStartX: null, // position of the dragged handle center when drag starts
      handleStartY: null,
      dragStartX: null, // position of the mouse when the drag starts
      dragStartY: null,
      dragThrottled: false,
      resizeThrottled: false,
      normalizedTransform: props.initialTransform,
      lastRotationAngle: props.rotationAngleDegrees,
      startRotationAngle: null,
      fineTune: false,
      imageDrag: true, // or rotate if false
    })
    const scan = ref(null)

    const layerTransform = computed(() => 'translate(0, 0)')
    const normalizationData = computed(() => props.ticData)
    const transform = computed(() => {
      const scaleAnnot = numeric.diag([state.naturalWidth / state.width, state.naturalHeight / state.height, 1])
      const scaleOptical = numeric.diag([
        state.opticalImageWidth / state.opticalImageNaturalWidth,
        state.opticalImageHeight / state.opticalImageNaturalHeight,
        1,
      ])

      return numeric.dot(scaleOptical, numeric.dot(state.normalizedTransform, scaleAnnot))
    })
    const handlePositions = computed(() => {
      // in original optical image dimensions
      return computeHandlePositions(state.normalizedTransform, originalHandlePositions())
    })
    const centerPosition = computed(() => {
      return computeHandlePositions(state.normalizedTransform, [
        {
          x: state.naturalWidth / 2,
          y: state.naturalHeight / 2,
        },
      ])[0]
    })
    const scaleX = computed(() => {
      return state.opticalImageWidth / state.opticalImageNaturalWidth || 1
    })
    const scaleY = computed(() => {
      return state.opticalImageHeight / state.opticalImageNaturalHeight || 1
    })
    const ionImageTransform = computed(() => {
      return numeric.dot(numeric.diag([scaleX.value, scaleY.value, 1]), state.normalizedTransform)
    })
    const annotImageStyle = computed(() => {
      return {
        'margin-top': -svgHeight.value + padding.value + 'px',
        'margin-left': padding.value + 'px',
        'vertical-align': 'top',
        width: '500px', // fixed width to simplify calculations
        'z-index': 8,
      }
    })
    const opticalImageStyle = computed(() => {
      return {
        'z-index': 1,
        margin: padding.value + 'px',
        width: `calc(100% - ${padding.value * 2}px)`,
      }
    })
    const svgWidth = computed(() => {
      return state.opticalImageWidth + 2 * padding.value
    })
    const svgHeight = computed(() => {
      return state.opticalImageHeight + 2 * padding.value
    })
    const handleLayerStyle = computed(() => {
      return {
        'z-index': 10,
        'pointer-events': 'none', // pass mouse events to the lower levels
        'vertical-align': 'top',
        position: 'relative',
        'margin-top': -state.opticalImageHeight - padding.value * 2 + 'px',
      }
    })
    const padding = computed(() => props.padding)
    const rotationAngleDegrees = computed(() => props.rotationAngleDegrees)
    const initialTransform = computed(() => props.initialTransform)

    const originalHandlePositions = () => {
      return [
        { x: 0, y: 0 },
        { x: 0, y: state.naturalHeight },
        { x: state.naturalWidth, y: 0 },
        { x: state.naturalWidth, y: state.naturalHeight },
      ]
    }

    const onOpticalImageLoad = () => {
      // Ignore if the image loads after the user has left the page
      if (scan.value != null) {
        state.opticalImageWidth = scan.value.width
        state.opticalImageHeight = scan.value.height
        state.opticalImageNaturalWidth = scan.value.naturalWidth
        state.opticalImageNaturalHeight = scan.value.naturalHeight
        state.normalizedTransform = initialTransform.value
      }
    }

    const onResize = () => {
      if (state.resizeThrottled) {
        return
      }

      state.resizeThrottled = true
      setTimeout(() => {
        state.resizeThrottled = false
      }, 50)

      if (!scan.value) {
        return
      }

      state.opticalImageWidth = scan.value.width
      state.opticalImageHeight = scan.value.height
      state.opticalImageNaturalWidth = scan.value.naturalWidth
      state.opticalImageNaturalHeight = scan.value.naturalHeight
    }

    const onLoad = ({ width, height, naturalWidth, naturalHeight }) => {
      state.width = width
      state.height = height
      state.naturalWidth = naturalWidth
      state.naturalHeight = naturalHeight
    }

    const onMouseDown = (event, handleIndex) => {
      event.preventDefault()
      state.draggedHandle = handleIndex
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
      state.handleStartX = handlePositions.value[handleIndex].x
      state.handleStartY = handlePositions.value[handleIndex].y
      document.addEventListener('mouseup', onMouseUp)
    }

    const onWheel = (event) => {
      event.preventDefault()

      const zoom = 1 - scrollDistance(event) / 30.0
      const rect = scan.value.getBoundingClientRect()
      const x = (event.clientX - rect.left) / scaleX.value
      const y = (event.clientY - rect.top) / scaleY.value
      const m = [
        [zoom, 0, -(zoom - 1) * x],
        [0, zoom, -(zoom - 1) * y],
        [0, 0, 1],
      ]
      state.normalizedTransform = numeric.dot(m, state.normalizedTransform)
    }

    function computeTransform(src, dst) {
      // http://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/
      const A = []
      const b = []
      for (let i = 0; i < 4; i++) {
        A.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x])
        b.push(dst[i].x)
        A.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y])
        b.push(dst[i].y)
      }

      const coeffs = numeric.dot(numeric.inv(A), b)

      return [
        [coeffs[0], coeffs[1], coeffs[2]],
        [coeffs[3], coeffs[4], coeffs[5]],
        [coeffs[6], coeffs[7], 1],
      ]
    }

    function computeHandlePositions(transformationMatrix, src) {
      function transformFunc({ x, y }) {
        const a = transformationMatrix
        const w = a[2][0] * x + a[2][1] * y + a[2][2]
        const x_ = (a[0][0] * x + a[0][1] * y + a[0][2]) / w
        const y_ = (a[1][0] * x + a[1][1] * y + a[1][2]) / w
        return { x: x_, y: y_ }
      }

      return src.map(transformFunc)
    }

    const updateHandlePosition = (event) => {
      const pos = handlePositions.value.slice()

      if (state.draggedHandle !== null) {
        // dragging one handle
        pos[state.draggedHandle] = {
          x: state.handleStartX + (event.clientX - state.dragStartX) / scaleX.value,
          y: state.handleStartY + (event.clientY - state.dragStartY) / scaleY.value,
        }
      } else {
        // dragging the image
        pos[0] = {
          x: state.handleStartX + (event.clientX - state.dragStartX) / scaleX.value,
          y: state.handleStartY + (event.clientY - state.dragStartY) / scaleY.value,
        }
        for (let i = 1; i < 4; i++) {
          pos[i] = {
            x: handlePositions.value[i].x - handlePositions.value[0].x + pos[0].x,
            y: handlePositions.value[i].y - handlePositions.value[0].y + pos[0].y,
          }
        }
      }

      try {
        state.normalizedTransform = computeTransform(originalHandlePositions(), pos)
      } catch (err) {
        console.error(err)
      }
    }

    const updateRotation = () => {
      // pass
    }

    const onMouseUp = (event) => {
      updateHandlePosition(event)
      state.draggedHandle = null
      state.dragThrottled = false
      document.removeEventListener('mouseup', onMouseUp)
      state.dragStartX = state.dragStartY = null
    }

    const onRightMouseUp = (event) => {
      updateRotation(event)
      state.draggedHandle = null
      state.dragThrottled = false
      document.removeEventListener('mouseup', onRightMouseUp)
      state.dragStartX = state.dragStartY = null
      state.imageDrag = true
    }

    const onMouseMove = (event) => {
      if (state.imageDrag === true) {
        onImageDrag(event)
      } else {
        onImageRotate(event)
      }
    }

    const onImageDrag = (event) => {
      if (state.dragStartX === null || state.dragThrottled) {
        return
      }

      state.dragThrottled = true
      setTimeout(() => {
        state.dragThrottled = false
      }, 30)
      updateHandlePosition(event)
    }

    const onImageRotate = (event) => {
      if (state.dragStartX === null || state.dragThrottled) {
        return
      }
      state.dragThrottled = true
      setTimeout(() => {
        state.dragThrottled = false
      }, 30)
      const cp = {
        x: centerPosition.value.x * scaleX.value + padding.value,
        y: centerPosition.value.x * scaleX.value + padding.value,
      }
      const rect = scan.value.getBoundingClientRect()

      const a = {
        x: (state.dragStartX - rect.left) / scaleX.value,
        y: (state.dragStartY - rect.top) / scaleY.value,
      }
      const b = {
        x: (event.clientX - rect.left) / scaleX.value,
        y: (event.clientY - rect.top) / scaleY.value,
      }

      const a1 = Math.atan2(a.x - cp.x, a.y - cp.y)
      const a2 = Math.atan2(b.x - cp.x, b.y - cp.y)
      const deltaAngle = (360.0 / Math.PI) * (a1 - a2)

      emit('updateRotationAngle', state.startRotationAngle + deltaAngle)
    }

    const onImageMouseDown = (event) => {
      event.preventDefault()
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
      state.handleStartX = handlePositions.value[0].x
      state.handleStartY = handlePositions.value[0].y
      document.addEventListener('mouseup', onMouseUp)
    }

    const onImageRightMouseDown = (event) => {
      event.preventDefault()
      state.imageDrag = false
      state.startRotationAngle = rotationAngleDegrees.value
      document.removeEventListener('mouseup', onMouseUp)
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
      state.handleStartX = handlePositions.value[0].x
      state.handleStartY = handlePositions.value[0].y
      document.addEventListener('mouseup', onRightMouseUp)
    }

    const onDoubleClick = () => {
      state.fineTune = !state.fineTune
    }

    const reset = () => {
      state.normalizedTransform = props.initialTransform
      state.lastRotationAngle = props.rotationAngleDegrees
    }

    const rotationMatrix = (degrees) => {
      const c = Math.cos((degrees / 180) * Math.PI)
      const s = Math.sin((degrees / 180) * Math.PI)
      const x = -state.naturalWidth / 2
      const y = -state.naturalHeight / 2
      return [
        [c, -s, (c - 1) * x - s * y],
        [s, c, (c - 1) * y + s * x],
        [0, 0, 1],
      ]
    }

    watch(padding, async () => {
      await nextTick()
      onResize()
    })

    watch(rotationAngleDegrees, (deg) => {
      state.normalizedTransform = numeric.dot(state.normalizedTransform, rotationMatrix(deg - state.lastRotationAngle))
      state.lastRotationAngle = deg
    })

    watch(initialTransform, async () => {
      state.normalizedTransform = initialTransform.value
    })

    onMounted(() => {
      window.addEventListener('resize', onResize)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', onResize)
    })

    return {
      ...toRefs(state),
      scan,
      layerTransform,
      normalizationData,
      transform,
      handlePositions,
      centerPosition,
      scaleX,
      scaleY,
      ionImageTransform,
      annotImageStyle,
      opticalImageStyle,
      svgWidth,
      svgHeight,
      handleLayerStyle,
      originalHandlePositions,
      onOpticalImageLoad,
      onResize,
      onLoad,
      onMouseDown,
      onWheel,
      updateHandlePosition,
      updateRotation,
      onMouseUp,
      onRightMouseUp,
      onMouseMove,
      onImageDrag,
      onImageRotate,
      onImageMouseDown,
      onImageRightMouseDown,
      onDoubleClick,
      reset,
      rotationMatrix,
    }
  },
})
</script>
<style>
circle.handle {
  cursor: move;
  stroke-width: 4px;
  stroke: #ffb000;
  fill: none;

  /* we want the unpainted interior to respond to hover */
  pointer-events: all;
}

line.cross {
  stroke: #f0fff0;
  stroke-width: 2;
}

.optical-img-container,
.handles-container {
  line-height: 0;
}
</style>
