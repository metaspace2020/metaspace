import { computed, defineComponent, PropType, ref, onMounted, nextTick, reactive, onBeforeUnmount, watch } from 'vue'
import { ElIcon, ElInput, ElButton, ElProgress } from '../../../lib/element-plus'
import { View, Edit, Hide, View as Show, Check, Close } from '@element-plus/icons-vue'
import { getOS } from '../../../lib/util'
import './SegmentationVisualization.scss'

interface SegmentSummary {
  id: number
  size_px: number
  coverage_fraction: number
  top_ions: string[]
}

interface SegmentationData {
  algorithm: string
  map_type: string
  n_segments: number
  parameters_used: {
    n_components: number | null
    variance_threshold: number
    k: number
    k_range: number[]
    criterion: string
  }
  segment_summary: SegmentSummary[]
  diagnostics: {
    bic_curve: any
    explained_variance: number[]
    spatial_weights: any
  }
}

interface DiagnosticImage {
  key: string
  index: number | null
  url: string
  format: string
}

interface DiagnosticData {
  id: string
  type: string
  updatedDT: string
  data: string
  images: DiagnosticImage[]
}

// Predefined colors for segments (matching the provided image)
const SEGMENT_COLORS = [
  '#5B9BD5', // Blue - Segment 0
  '#70AD47', // Green - Segment 1
  '#A5A5A5', // Gray - Segment 2
  '#FFC000', // Yellow - Segment 3
  '#C55A5A', // Red - Segment 4
  '#9966CC', // Purple - Segment 5
  '#FF9900', // Orange - Segment 6
  '#00B4D8', // Cyan - Segment 7
  '#FF6B9D', // Pink - Segment 8
  '#8FBC8F', // Sea Green - Segment 9
]

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

  const renderScrollBlock = () => (
    <div
      class={{
        'absolute p-4 inset-0 z-30 pointer-events-none bg-gray-900 bg-opacity-75 flex items-center justify-center':
          true,
        'opacity-0 duration-1000': !state.overlayFadingIn,
        'opacity-100 duration-700': state.overlayFadingIn,
      }}
    >
      <p class="relative block z-40 m-0 text-white text-2xl">Use {messageOS.value} to zoom the image</p>
    </div>
  )

  return { showScrollBlock, renderScrollBlock }
}

export const SegmentationVisualization = defineComponent({
  name: 'SegmentationVisualization',
  props: {
    diagnosticData: {
      type: Object as PropType<DiagnosticData>,
      required: true,
    },
    showLegend: {
      type: Boolean,
      default: true,
    },
    resetViewTrigger: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const imageLoading = ref(false)
    const imageError = ref(false)

    const { showScrollBlock, renderScrollBlock } = useScrollBlock()

    // State for segment editing and visibility
    const segmentState = reactive<{
      editingSegment: number | null
      segmentNames: { [key: number]: string }
      hiddenSegments: Set<number>
      tempInputValue: string
    }>({
      editingSegment: null,
      segmentNames: {},
      hiddenSegments: new Set(),
      tempInputValue: '',
    })

    // State for pan and zoom functionality
    const canvasState = reactive({
      scale: 1,
      translateX: 0,
      translateY: 0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
      minScale: 0.1,
      maxScale: 5,
    })
    const segmentationData = computed<SegmentationData | null>(() => {
      try {
        return JSON.parse(props.diagnosticData.data)
      } catch (error) {
        console.error('Failed to parse segmentation data:', error)
        return null
      }
    })

    const labelMapImage = computed(() => {
      return props.diagnosticData.images.find((img) => img.key === 'LABEL_MAP')
    })

    const getSegmentColor = (segmentId: number) => {
      return SEGMENT_COLORS[segmentId % SEGMENT_COLORS.length]
    }

    const getSegmentName = (segmentId: number) => {
      return segmentState.segmentNames[segmentId] || `Segment ${segmentId}`
    }

    const handleEditSegment = (segmentId: number) => {
      segmentState.editingSegment = segmentId
      segmentState.tempInputValue = segmentState.segmentNames[segmentId] || `Segment ${segmentId}`
    }

    const handleSaveSegmentName = (segmentId: number) => {
      segmentState.segmentNames[segmentId] = segmentState.tempInputValue.trim() || `Segment ${segmentId}`
      segmentState.editingSegment = null
      segmentState.tempInputValue = ''
    }

    const handleCancelEdit = () => {
      segmentState.editingSegment = null
      segmentState.tempInputValue = ''
    }

    const handleInputChange = (value: string) => {
      segmentState.tempInputValue = value
    }

    const handleToggleSegmentVisibility = (segmentId: number) => {
      if (segmentState.hiddenSegments.has(segmentId)) {
        segmentState.hiddenSegments.delete(segmentId)
      } else {
        segmentState.hiddenSegments.add(segmentId)
      }
      // Re-render the canvas
      loadAndRenderSegmentationImage()
    }

    // Pan and zoom event handlers
    const handleMouseDown = (event: MouseEvent) => {
      canvasState.isDragging = true
      canvasState.lastMouseX = event.clientX
      canvasState.lastMouseY = event.clientY
      event.preventDefault()
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!canvasState.isDragging) return

      const deltaX = event.clientX - canvasState.lastMouseX
      const deltaY = event.clientY - canvasState.lastMouseY

      canvasState.translateX += deltaX
      canvasState.translateY += deltaY

      canvasState.lastMouseX = event.clientX
      canvasState.lastMouseY = event.clientY

      updateCanvasTransform()
      event.preventDefault()
    }

    const handleMouseUp = () => {
      canvasState.isDragging = false
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()

        const canvas = canvasRef.value
        if (!canvas) return

        // Get the container's bounding rect since the event is on the container
        const container = event.currentTarget as HTMLElement
        const rect = container.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top

        // Slower zoom speed: reduced from 0.9/1.1 to 0.95/1.05
        const scaleFactor = event.deltaY > 0 ? 0.95 : 1.05
        const newScale = Math.max(canvasState.minScale, Math.min(canvasState.maxScale, canvasState.scale * scaleFactor))

        if (newScale !== canvasState.scale) {
          // Zoom towards mouse position
          const scaleChange = newScale / canvasState.scale
          canvasState.translateX = mouseX - (mouseX - canvasState.translateX) * scaleChange
          canvasState.translateY = mouseY - (mouseY - canvasState.translateY) * scaleChange
          canvasState.scale = newScale

          updateCanvasTransform()
        }
      } else {
        showScrollBlock()
      }
    }

    const updateCanvasTransform = () => {
      const canvas = canvasRef.value
      if (!canvas) return

      const translateX = canvasState.translateX
      const translateY = canvasState.translateY
      const scale = canvasState.scale
      canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
    }

    const resetCanvasTransform = () => {
      canvasState.scale = 1
      canvasState.translateX = 0
      canvasState.translateY = 0
      updateCanvasTransform()
    }

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 }
    }

    const loadAndRenderSegmentationImage = async () => {
      if (!labelMapImage.value || !canvasRef.value) return

      try {
        imageLoading.value = true
        imageError.value = false

        const response = await fetch(labelMapImage.value.url)
        if (!response.ok) {
          throw new Error(`Failed to fetch NPY data: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const view = new DataView(arrayBuffer)

        const magic = new Uint8Array(arrayBuffer, 0, 6)
        const magicStr = String.fromCharCode(...magic)
        if (magicStr !== '\x93NUMPY') {
          throw new Error('Invalid NPY file format')
        }

        const majorVersion = view.getUint8(6)
        const minorVersion = view.getUint8(7)

        let headerLength: number
        let dataOffset: number

        if (majorVersion === 1) {
          headerLength = view.getUint16(8, true)
          dataOffset = 10 + headerLength
        } else if (majorVersion === 2) {
          headerLength = view.getUint32(8, true)
          dataOffset = 12 + headerLength
        } else {
          throw new Error(`Unsupported NPY version: ${majorVersion}.${minorVersion}`)
        }

        const headerBytes = new Uint8Array(arrayBuffer, majorVersion === 1 ? 10 : 12, headerLength)
        const headerStr = String.fromCharCode(...headerBytes).trim()

        const shapeMatch = headerStr.match(/'shape':\s*\((\d+),\s*(\d+)\)/)
        const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/)

        if (!shapeMatch || !dtypeMatch) {
          throw new Error('Could not parse NPY header')
        }

        const height = parseInt(shapeMatch[1])
        const width = parseInt(shapeMatch[2])
        const dtype = dtypeMatch[1]

        let segmentData: number[]
        const dataView = new DataView(arrayBuffer, dataOffset)

        if (dtype.includes('i4') || dtype.includes('<i4')) {
          segmentData = []
          for (let i = 0; i < height * width; i++) {
            segmentData.push(dataView.getInt32(i * 4, true))
          }
        } else if (dtype.includes('i2') || dtype.includes('<i2')) {
          segmentData = []
          for (let i = 0; i < height * width; i++) {
            segmentData.push(dataView.getInt16(i * 2, true))
          }
        } else if (dtype.includes('i1') || dtype.includes('u1')) {
          segmentData = Array.from(new Uint8Array(arrayBuffer, dataOffset, height * width))
        } else {
          throw new Error(`Unsupported dtype: ${dtype}`)
        }

        const canvas = canvasRef.value!
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')!
        const imageData = ctx.createImageData(width, height)

        const segmentColors =
          segmentationData.value?.segment_summary.map((segment) => {
            const color = getSegmentColor(segment.id)
            return hexToRgb(color)
          }) || []

        for (let i = 0; i < segmentData.length; i++) {
          const segmentId = segmentData[i]
          const pixelIndex = i * 4

          if (segmentId >= 0 && segmentId < segmentColors.length && !segmentState.hiddenSegments.has(segmentId)) {
            const color = segmentColors[segmentId]
            imageData.data[pixelIndex] = color.r
            imageData.data[pixelIndex + 1] = color.g
            imageData.data[pixelIndex + 2] = color.b
            imageData.data[pixelIndex + 3] = 255
          } else {
            imageData.data[pixelIndex] = 0
            imageData.data[pixelIndex + 1] = 0
            imageData.data[pixelIndex + 2] = 0
            imageData.data[pixelIndex + 3] = 0
          }
        }

        ctx.putImageData(imageData, 0, 0)
      } catch (error) {
        console.error('Error loading segmentation image:', error)
        imageError.value = true
      } finally {
        imageLoading.value = false
      }
    }

    onMounted(() => {
      nextTick(() => {
        if (labelMapImage.value) {
          loadAndRenderSegmentationImage()
        }
      })

      // Add global event listeners for mouse events
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    })

    // Cleanup event listeners
    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    onBeforeUnmount(cleanup)

    // Watch for reset view trigger
    watch(
      () => props.resetViewTrigger,
      (newValue, oldValue) => {
        if (newValue > oldValue) {
          resetCanvasTransform()
        }
      }
    )

    const renderSegmentLegend = () => {
      if (!segmentationData.value) return null

      return (
        <div class="segmentation-legend">
          <div class="segments-list">
            {segmentationData.value.segment_summary.map((segment) => (
              <div key={segment.id} class="segment-item">
                <div class="segment-row">
                  <div class="segment-info">
                    <div class="color-swatch" style={{ backgroundColor: getSegmentColor(segment.id) }} />

                    {segmentState.editingSegment === segment.id ? (
                      <ElInput
                        modelValue={segmentState.tempInputValue}
                        size="small"
                        class="segment-name-input"
                        onInput={handleInputChange}
                        onKeyup={(e: KeyboardEvent) => {
                          if (e.key === 'Enter') {
                            handleSaveSegmentName(segment.id)
                          } else if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span class="segment-name">{getSegmentName(segment.id)}</span>
                    )}
                  </div>

                  <div class="segment-stats">
                    <ElProgress
                      percentage={Math.round(segment.coverage_fraction * 100)}
                      strokeWidth={12}
                      textInside={true}
                      color={getSegmentColor(segment.id)}
                      class="segment-progress"
                    />
                  </div>

                  <div class="segment-actions">
                    {segmentState.editingSegment === segment.id ? (
                      <>
                        <ElButton
                          size="small"
                          link={true}
                          onClick={() => handleSaveSegmentName(segment.id)}
                          class="action-button save-button"
                        >
                          <ElIcon>
                            <Check />
                          </ElIcon>
                        </ElButton>

                        <ElButton
                          size="small"
                          link={true}
                          onClick={handleCancelEdit}
                          class="action-button cancel-button !ml-0"
                        >
                          <ElIcon>
                            <Close />
                          </ElIcon>
                        </ElButton>
                      </>
                    ) : (
                      <>
                        <ElButton
                          size="small"
                          link={true}
                          onClick={() => handleToggleSegmentVisibility(segment.id)}
                          class="action-button"
                        >
                          <ElIcon>{segmentState.hiddenSegments.has(segment.id) ? <Show /> : <Hide />}</ElIcon>
                        </ElButton>

                        <ElButton
                          size="small"
                          link={true}
                          onClick={() => handleEditSegment(segment.id)}
                          class="action-button !ml-0"
                        >
                          <ElIcon>
                            <Edit />
                          </ElIcon>
                        </ElButton>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    const renderSegmentationImage = () => {
      if (!labelMapImage.value) {
        return (
          <div class="image-placeholder">
            <div class="placeholder-content">
              <ElIcon class="placeholder-icon">
                <View />
              </ElIcon>
              <p>Segmentation image not available</p>
            </div>
          </div>
        )
      }

      return (
        <div
          class="segmentation-image-container"
          style={{
            cursor: canvasState.isDragging ? 'grabbing' : 'grab',
          }}
          onMousedown={handleMouseDown}
          onWheel={handleWheel}
        >
          <div class="image-wrapper">
            {imageError.value && (
              <div class="error-placeholder">
                <div class="placeholder-content">
                  <ElIcon class="placeholder-icon">
                    <View />
                  </ElIcon>
                  <p>Failed to load segmentation image</p>
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              class="segmentation-canvas"
              style={{
                display: imageLoading.value || imageError.value ? 'none' : 'block',
                maxWidth: '100%',
                height: 'auto',
                transformOrigin: '0 0',
                pointerEvents: 'none',
              }}
            />
          </div>
          {renderScrollBlock()}
        </div>
      )
    }

    return () => {
      if (!segmentationData.value) {
        return (
          <div class="segmentation-error">
            <p>Failed to load segmentation data</p>
          </div>
        )
      }

      return (
        <div class="segmentation-visualization">
          <div class="visualization-content">
            <div class="image-section">{renderSegmentationImage()}</div>
            {props.showLegend && <div class="legend-section">{renderSegmentLegend()}</div>}
          </div>
        </div>
      )
    }
  },
})
