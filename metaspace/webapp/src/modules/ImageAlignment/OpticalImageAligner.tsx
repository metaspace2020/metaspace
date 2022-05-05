import { computed, defineComponent, onMounted, reactive, ref, watch, watchEffect } from '@vue/composition-api'
import './OpticalImageAligner.scss'
import { scrollDistance } from '../../lib/util'
// @ts-ignore
import { inv, dot, diag } from 'numeric'

interface OpticalImageAlignerProps {
  src: string
  enableTransform: boolean
  externalDrag: any
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
    externalDrag: {
      type: MouseEvent,
      default: () => {},
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
      normalizedTransform: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      isDragging: false,
      dragThrottled: false,
      dragStartX: 0,
      dragStartY: 0,
    })
    const canvasSrc = ref<any>(null)

    watch(() => props.src, () => {
      console.log('props', props.src, canvasSrc.value)
    })

    watch(() => props.externalDrag, () => {
      // console.log('externalDrag', props.externalDrag)
      if (props.externalDrag) {
        handleMouseMove(props.externalDrag)
      }
    })

    onMounted(() => {
      const canvas = canvasSrc.value
      const context = canvas.getContext('2d')
      const imageObj = new Image()
      imageObj.src = props.src
      imageObj.onload = function() {
        let imgWidth = imageObj.naturalWidth
        const screenWidth = canvas.width
        let scaleX = 1
        if (imgWidth > screenWidth) { scaleX = screenWidth / imgWidth }
        let imgHeight = imageObj.naturalHeight
        const screenHeight = canvas.height
        let scaleY = 1
        if (imgHeight > screenHeight) { scaleY = screenHeight / imgHeight }
        let scale = scaleY
        if (scaleX < scaleY) { scale = scaleX }
        if (scale < 1) {
          imgHeight = imgHeight * scale
          imgWidth = imgWidth * scale
        }

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
        })
      }
    })

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
      const m = [[zoom, 0, 0],
        [0, zoom, 0],
        [0, 0, 1]]
      state.zoom = zoom
      state.normalizedTransform = dot(m, state.normalizedTransform)
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
        state.dragStartX = event.clientX
        state.dragStartY = event.clientY
      }
    }

    return () => {
      return (
        <div
          class='flex items-center justify-center'
          onWheel={handleMouseWheel}
        >
          <canvas
            ref={canvasSrc}
            onmousedown={handleMouseDown}
            onmouseup={handleMouseUp}
            onmouseout={handleMouseUp}
            onmousemove={handleMouseMove}
            width={window.innerWidth - 100} height={900}
            style={{
              transform: formatMatrix3d(state.normalizedTransform),
            }}
          />
        </div>
      )
    }
  },
})
