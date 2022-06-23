import {
  defineComponent,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from '@vue/composition-api'
import { scrollDistance } from '../../lib/util'
// @ts-ignore
import { inv, dot, diag } from 'numeric'
import './OpticalImageAligner.scss'

interface OpticalImageAlignerProps {
  src: string
  enableTransform: boolean
  externalDrag: any
  externalZoom: number
  disableInternalController: boolean
  initialTransform: number[][],
}

interface OpticalImageAlignerState {
  opticalImageWidth: number,
  opticalImageHeight: number,
  opticalImageNaturalWidth: number,
  opticalImageNaturalHeight: number,
  dragStartX: number,
  dragStartY: number,
  zoom: number,
  normalizedTransform: number[][],
  isDragging: boolean
  dragThrottled: boolean
}

export const OpticalImageAligner = defineComponent<OpticalImageAlignerProps>({
  name: 'OpticalImageAligner',
  props: {
    src: {
      type: String,
      default: '',
    },
    enableTransform: {
      type: Boolean,
      default: true,
    },
    disableInternalController: {
      type: Boolean,
      default: false,
    },
    externalDrag: {
      type: Object,
      default: () => {},
    },
    externalZoom: {
      type: Number,
      default: 1,
    },
    initialTransform: {
      type: Array,
      default: () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
  },
  // @ts-ignore
  setup(props, { emit }) {
    const state = reactive<OpticalImageAlignerState>({
      opticalImageWidth: 0,
      opticalImageHeight: 0,
      opticalImageNaturalWidth: 0,
      opticalImageNaturalHeight: 0,
      zoom: 1,
      normalizedTransform: props.initialTransform,
      isDragging: false,
      dragThrottled: false,
      dragStartX: 0,
      dragStartY: 0,
    })
    const canvasSrc = ref<any>(null)

    watch(() => props.src, () => { // check for src image update
      if (props.src && canvasSrc.value) {
        state.normalizedTransform = props.initialTransform
        loadImg(true)
      }
    })

    watch(() => props.externalZoom, () => { // check for external zoom update
      if (props.externalZoom && props.disableInternalController) {
        handleZoomChange(props.externalZoom)
      }
    })

    watch(() => props.externalDrag, () => { // check for external drag mouse x,y update
      if (
        props.externalDrag
        && props.externalDrag.deltaX
        && props.externalDrag.deltaY && props.disableInternalController) {
        handleDeltaUpdate(props.externalDrag)
      }
    })

    onMounted(() => {
      loadImg(true)
      window.addEventListener('resize', () => { loadImg() })
    })

    onUnmounted(() => {
      window.removeEventListener('resize', () => { loadImg() })
    })

    const loadImg = (resetTransform = false) => {
      const canvas = canvasSrc.value
      const context = canvas.getContext('2d')
      const imageObj = new Image()
      imageObj.src = props.src
      imageObj.onload = function() {
        const imgWidth = window.innerWidth - 40 // remove margin from total width (20px)
        const imgHeight = imageObj.naturalHeight * imgWidth / imageObj.naturalWidth // scale height according to width
        canvas.height = imgHeight
        canvas.width = imgWidth
        context.imageSmoothingEnabled = false
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(imageObj, 0, 0, imageObj.naturalWidth, imageObj.naturalHeight, 0, 0, imgWidth, imgHeight)
        state.opticalImageWidth = imgWidth
        state.opticalImageHeight = imgHeight
        state.opticalImageNaturalWidth = imageObj.naturalWidth
        state.opticalImageNaturalHeight = imageObj.naturalHeight
        emit('load', {
          width: imgWidth,
          height: imgHeight,
          naturalWidth: imageObj.naturalWidth,
          naturalHeight: imageObj.naturalHeight,
          resetTransform,
        })
      }
    }

    const formatMatrix3d = (t: readonly number[][]) =>
      `matrix3d(${t[0][0]}, ${t[1][0]}, 0, ${t[2][0]},
             ${t[0][1]}, ${t[1][1]}, 0, ${t[2][1]},
                      0,          0, 1,          0,
             ${t[0][2]}, ${t[1][2]}, 0, ${t[2][2]})`

    const handleMouseWheel = (event:any) => {
      if (!props.enableTransform) {
        return null
      }
      event.preventDefault()
      const zoom = 1 - scrollDistance(event) / 30.0
      handleZoomChange(zoom)
    }

    const handleZoomChange = (zoom:number) => {
      const m = [[zoom, 0, 0],
        [0, zoom, 0],
        [0, 0, 1]]
      state.zoom = zoom
      state.normalizedTransform = dot(m, state.normalizedTransform)
      emit('update', state.normalizedTransform)
    }

    const handleMouseDown = (event:any) => {
      state.isDragging = true
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
    }

    const handleMouseUp = (event:any) => {
      state.isDragging = false
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
    }

    const handleMouseMove = (event:any) => {
      if (!state.dragStartX || state.dragThrottled || !props.enableTransform) {
        return
      }

      if (state.isDragging) {
        state.dragThrottled = true
        setTimeout(() => { state.dragThrottled = false }, 30)
        const x = (event.clientX - state.dragStartX)
        const y = (event.clientY - state.dragStartY)
        const m = [[1, 0, x],
          [0, 1, y],
          [0, 0, 1]]
        state.normalizedTransform = dot(m, state.normalizedTransform)
        emit('update', state.normalizedTransform)
        state.dragStartX = event.clientX
        state.dragStartY = event.clientY
      }
    }

    const handleDeltaUpdate = ({ deltaX, deltaY } : { deltaX:number, deltaY:number}) => {
      const m = [[1, 0, deltaX],
        [0, 1, deltaY],
        [0, 0, 1]]
      state.normalizedTransform = dot(m, state.normalizedTransform)
      emit('update', state.normalizedTransform)
      loadImg()
    }

    return () => {
      const dragControllers = props.disableInternalController ? {} : {
        on: {
          mousedown: handleMouseDown,
          mouseup: handleMouseUp,
          mouseout: handleMouseUp,
          mousemove: handleMouseMove,
        },
      }
      const zoomController = props.disableInternalController ? {} : {
        on: {
          wheel: handleMouseWheel,
        },
      }

      return (
        <div
          class='optical-image-aligner flex items-center justify-center'
          {...zoomController}
        >
          <canvas
            ref={canvasSrc}
            width={window.innerWidth} height={900}
            style={{
              transform: formatMatrix3d(state.normalizedTransform),
            }}
            {...dragControllers}
          />
        </div>
      )
    }
  },
})
