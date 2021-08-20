<template>
  <div
    class="image-alignment-box"
    @mousemove="onMouseMove"
  >
    <div
      v-loading="!opticalImageNaturalHeight"
      class="optical-img-container"
      style="border: 1px solid #ddf"
    >
      <img
        ref="scan"
        :src="opticalSrc"
        :style="opticalImageStyle"
        @load="onOpticalImageLoad"
      >
    </div>

    <div class="handles-container">
      <svg
        ref="handles"
        :width="svgWidth"
        :height="svgHeight"
        :style="handleLayerStyle"
      >
        <g
          v-if="!isNaN(scaleX * scaleY)"
          :transform="layerTransform"
        >
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
      :image-style="{overflow: 'visible'}"
      :image-fit-params="{areaWidth: naturalWidth || 1, areaHeight: naturalHeight || 1}"
      :max-height="100500"
      :annot-image-opacity="annotImageOpacity"
      :ion-image-transform="ionImageTransform"
      :normalization-data="normalizationData"
      opacity-mode="linear"
      @dblclick.native="onDoubleClick"
      @mousedown.native="onImageMouseDown"
      @contextmenu.native="onImageRightMouseDown"
      @wheel.native="onWheel"
      @redraw="onLoad"
    />
  </div>
</template>

<script>
import ImageLoader from '../../components/ImageLoader.vue'
import { inv, dot, diag } from 'numeric'
import { scrollDistance } from '../../lib/util'

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

  const coeffs = dot(inv(A), b)

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

export default {
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
      default: () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
    ticData: { type: Object },
  },
  data() {
    return {
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
      normalizedTransform: this.initialTransform,
      lastRotationAngle: this.rotationAngleDegrees,
      startRotationAngle: null,
      fineTune: false,
      imageDrag: true, // or rotate if false
    }
  },
  computed: {
    layerTransform() {
      return 'translate(0, 0)'
    },

    normalizationData() {
      return this.ticData
    },

    transform() {
      const scaleAnnot = diag([
        this.naturalWidth / this.width,
        this.naturalHeight / this.height,
        1,
      ])
      const scaleOptical = diag([
        this.opticalImageWidth / this.opticalImageNaturalWidth,
        this.opticalImageHeight / this.opticalImageNaturalHeight,
        1,
      ])

      return dot(scaleOptical, dot(this.normalizedTransform, scaleAnnot))
    },

    handlePositions() {
      // in original optical image dimensions
      return computeHandlePositions(this.normalizedTransform, this.originalHandlePositions())
    },

    centerPosition() {
      return computeHandlePositions(this.normalizedTransform,
        [{
          x: this.naturalWidth / 2,
          y: this.naturalHeight / 2,
        }])[0]
    },

    scaleX() {
      return this.opticalImageWidth / this.opticalImageNaturalWidth || 1
    },

    scaleY() {
      return this.opticalImageHeight / this.opticalImageNaturalHeight || 1
    },
    ionImageTransform() {
      return dot(diag([this.scaleX, this.scaleY, 1]), this.normalizedTransform)
    },

    annotImageStyle() {
      return {
        'margin-top': (-this.svgHeight + this.padding) + 'px',
        'margin-left': this.padding + 'px',
        'vertical-align': 'top',
        width: '500px', // fixed width to simplify calculations
        'z-index': 8,
      }
    },

    opticalImageStyle() {
      return {
        'z-index': 1,
        margin: this.padding + 'px',
        width: `calc(100% - ${this.padding * 2}px)`,
      }
    },

    svgWidth() {
      return this.opticalImageWidth + 2 * this.padding
    },

    svgHeight() {
      return this.opticalImageHeight + 2 * this.padding
    },

    handleLayerStyle() {
      return {
        'z-index': 10,
        'pointer-events': 'none', // pass mouse events to the lower levels
        'vertical-align': 'top',
        position: 'relative',
        'margin-top': (-this.opticalImageHeight - this.padding * 2) + 'px',
      }
    },
  },

  watch: {
    padding() {
      this.$nextTick(() => {
        this.onResize()
      })
    },

    rotationAngleDegrees(deg) {
      this.normalizedTransform = dot(
        this.normalizedTransform,
        this.rotationMatrix(deg - this.lastRotationAngle),
      )
      this.lastRotationAngle = deg
    },

    initialTransform() {
      this.normalizedTransform = this.initialTransform
    },
  },

  mounted: function() {
    window.addEventListener('resize', this.onResize)
  },

  beforeDestroy: function() {
    window.removeEventListener('resize', this.onResize)
  },

  methods: {
    originalHandlePositions() {
      return [
        { x: 0, y: 0 },
        { x: 0, y: this.naturalHeight },
        { x: this.naturalWidth, y: 0 },
        { x: this.naturalWidth, y: this.naturalHeight },
      ]
    },

    onOpticalImageLoad() {
      // Ignore if the image loads after the user has left the page
      if (this.$refs.scan != null) {
        this.opticalImageWidth = this.$refs.scan.width
        this.opticalImageHeight = this.$refs.scan.height
        this.opticalImageNaturalWidth = this.$refs.scan.naturalWidth
        this.opticalImageNaturalHeight = this.$refs.scan.naturalHeight
        this.normalizedTransform = this.initialTransform
      }
    },

    onResize() {
      if (this.resizeThrottled) {
        return
      }

      this.resizeThrottled = true
      setTimeout(() => { this.resizeThrottled = false }, 50)

      if (!this.$refs.scan) {
        return
      }

      this.opticalImageWidth = this.$refs.scan.width
      this.opticalImageHeight = this.$refs.scan.height
      this.opticalImageNaturalWidth = this.$refs.scan.naturalWidth
      this.opticalImageNaturalHeight = this.$refs.scan.naturalHeight
    },

    onLoad({ width, height, naturalWidth, naturalHeight }) {
      this.width = width
      this.height = height
      this.naturalWidth = naturalWidth
      this.naturalHeight = naturalHeight
    },

    onMouseDown(event, handleIndex) {
      event.preventDefault()
      this.draggedHandle = handleIndex
      this.dragStartX = event.clientX
      this.dragStartY = event.clientY
      this.handleStartX = this.handlePositions[handleIndex].x
      this.handleStartY = this.handlePositions[handleIndex].y
      document.addEventListener('mouseup', this.onMouseUp)
    },

    onWheel(event) {
      event.preventDefault()

      const zoom = 1 - scrollDistance(event) / 30.0
      const rect = this.$refs.scan.getBoundingClientRect()
      const x = (event.clientX - rect.left) / this.scaleX
      const y = (event.clientY - rect.top) / this.scaleY
      const m = [[zoom, 0, -(zoom - 1) * x],
        [0, zoom, -(zoom - 1) * y],
        [0, 0, 1]]
      this.normalizedTransform = dot(m, this.normalizedTransform)
    },

    updateHandlePosition(event) {
      const pos = this.handlePositions.slice()

      if (this.draggedHandle !== null) { // dragging one handle
        pos[this.draggedHandle] = {
          x: this.handleStartX + (event.clientX - this.dragStartX) / this.scaleX,
          y: this.handleStartY + (event.clientY - this.dragStartY) / this.scaleY,
        }
      } else { // dragging the image
        pos[0] = {
          x: this.handleStartX + (event.clientX - this.dragStartX) / this.scaleX,
          y: this.handleStartY + (event.clientY - this.dragStartY) / this.scaleY,
        }
        for (let i = 1; i < 4; i++) {
          pos[i] = {
            x: this.handlePositions[i].x - this.handlePositions[0].x + pos[0].x,
            y: this.handlePositions[i].y - this.handlePositions[0].y + pos[0].y,
          }
        }
      }

      try {
        this.normalizedTransform = computeTransform(this.originalHandlePositions(), pos)
      } catch (err) {
        console.error(err)
      }
    },

    updateRotation(event) {
    },

    onMouseUp(event) {
      this.updateHandlePosition(event)
      this.draggedHandle = null
      this.dragThrottled = false
      document.removeEventListener('mouseup', this.onMouseUp)
      this.dragStartX = this.dragStartY = null
    },

    onRightMouseUp(event) {
      this.updateRotation(event)
      this.draggedHandle = null
      this.dragThrottled = false
      document.removeEventListener('mouseup', this.onRightMouseUp)
      this.dragStartX = this.dragStartY = null
      this.imageDrag = true
    },

    onMouseMove(event) {
      if (this.imageDrag === true) {
        this.onImageDrag(event)
      } else {
        this.onImageRotate(event)
      }
    },

    onImageDrag(event) {
      if (this.dragStartX === null || this.dragThrottled) {
        return
      }

      this.dragThrottled = true
      setTimeout(() => { this.dragThrottled = false }, 30)
      this.updateHandlePosition(event)
    },

    onImageRotate(event) {
      if (this.dragStartX === null || this.dragThrottled) {
        return
      }
      this.dragThrottled = true
      setTimeout(() => { this.dragThrottled = false }, 30)
      const cp = {
        x: this.centerPosition.x * this.scaleX + this.padding,
        y: this.centerPosition.x * this.scaleX + this.padding,
      }
      const rect = this.$refs.scan.getBoundingClientRect()

      const a = {
        x: (this.dragStartX - rect.left) / this.scaleX,
        y: (this.dragStartY - rect.top) / this.scaleY,
      }
      const b = {
        x: (event.clientX - rect.left) / this.scaleX,
        y: (event.clientY - rect.top) / this.scaleY,

      }

      const a1 = Math.atan2(a.x - cp.x, a.y - cp.y)
      const a2 = Math.atan2(b.x - cp.x, b.y - cp.y)
      const deltaAngle = (360.0 / Math.PI) * (a1 - a2)

      this.$emit('updateRotationAngle', this.startRotationAngle + deltaAngle)
    },

    onImageMouseDown(event) {
      event.preventDefault()
      this.dragStartX = event.clientX
      this.dragStartY = event.clientY
      this.handleStartX = this.handlePositions[0].x
      this.handleStartY = this.handlePositions[0].y
      document.addEventListener('mouseup', this.onMouseUp)
    },

    onImageRightMouseDown(event) {
      event.preventDefault()
      this.imageDrag = false
      this.startRotationAngle = this.rotationAngleDegrees
      document.removeEventListener('mouseup', this.onMouseUp)
      this.dragStartX = event.clientX
      this.dragStartY = event.clientY
      this.handleStartX = this.handlePositions[0].x
      this.handleStartY = this.handlePositions[0].y
      document.addEventListener('mouseup', this.onRightMouseUp)
    },

    onDoubleClick(event) {
      this.fineTune = !this.fineTune
    },

    reset() {
      this.normalizedTransform = dot(diag([
        (this.width / this.naturalWidth) / this.scaleX,
        (this.height / this.naturalHeight) / this.scaleY,
        1,
      ]), this.rotationMatrix(this.rotationAngleDegrees))
    },

    rotationMatrix(degrees) {
      const c = Math.cos(degrees / 180 * Math.PI)
      const s = Math.sin(degrees / 180 * Math.PI)
      const x = -this.naturalWidth / 2
      const y = -this.naturalHeight / 2
      return [[c, -s, (c - 1) * x - s * y],
        [s, c, (c - 1) * y + s * x],
        [0, 0, 1]]
    },
  },
}
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
   stroke-width: 2
 }

 .optical-img-container, .handles-container {
   line-height: 0;
 }
</style>
