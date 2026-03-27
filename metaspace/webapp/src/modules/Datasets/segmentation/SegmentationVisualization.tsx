import { computed, defineComponent, PropType, ref, onMounted, nextTick, reactive, onBeforeUnmount, watch } from 'vue'
import { ElIcon, ElInput, ElButton, ElProgress } from '../../../lib/element-plus'
import { View, Edit, Hide, View as Show, Check, Close, Download } from '@element-plus/icons-vue'
import { getOS } from '../../../lib/util'
import OpacitySettings from '../../ImageViewer/OpacitySettings.vue'
import FadeTransition from '../../../components/FadeTransition'
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

interface OpticalImage {
  url: string
  transform: number[][]
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
    opticalImage: {
      type: Object as PropType<OpticalImage | null>,
      default: null,
    },
    showOpticalImage: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const opticalImageRef = ref<HTMLImageElement | null>(null)
    const viewBoxRef = ref<HTMLDivElement | null>(null)
    const imageLoading = ref(false)
    const imageError = ref(false)
    const opticalImageLoading = ref(false)
    const opticalImageError = ref(false)

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

    // State for optical image controls
    const opticalImageState = reactive({
      opticalOpacity: 1.0,
      segmentOpacity: 1.0,
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
      return segmentState.segmentNames[segmentId] || `Cluster ${segmentId}`
    }

    const handleEditSegment = (segmentId: number) => {
      segmentState.editingSegment = segmentId
      segmentState.tempInputValue = segmentState.segmentNames[segmentId] || `Cluster ${segmentId}`
    }

    const handleSaveSegmentName = (segmentId: number) => {
      segmentState.segmentNames[segmentId] = segmentState.tempInputValue.trim() || `Cluster ${segmentId}`
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
      // Re-render the segmentation canvas
      renderSegmentationCanvas()
    }

    const handleOpticalOpacityChange = (opacity: number) => {
      opticalImageState.opticalOpacity = opacity
    }

    const handleSegmentOpacityChange = (opacity: number) => {
      opticalImageState.segmentOpacity = opacity
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
      const viewBox = viewBoxRef.value
      if (!viewBox) return

      const { translateX, translateY, scale } = canvasState
      viewBox.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
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

    const getOpticalImageTransform = () => {
      if (!props.opticalImage?.transform) return 'none'
      const t = props.opticalImage.transform
      return `matrix(${t[0][0]}, ${t[1][0]}, ${t[0][1]}, ${t[1][1]}, ${t[0][2]}, ${t[1][2]})`
    }

    const loadOpticalImage = async () => {
      if (!props.opticalImage?.url || !opticalImageRef.value) return

      try {
        opticalImageLoading.value = true
        opticalImageError.value = false

        // Load optical image
        opticalImageRef.value.src = props.opticalImage.url
      } catch (error) {
        console.error('Error loading optical image:', error)
        opticalImageError.value = true
      }
    }

    const onOpticalImageLoad = () => {
      opticalImageLoading.value = false
      renderSegmentationCanvas()
    }

    const onOpticalImageError = () => {
      opticalImageLoading.value = false
      opticalImageError.value = true
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

        // Store segmentation data for canvas rendering
        ;(canvas as any).segmentData = segmentData
        ;(canvas as any).segmentWidth = width
        ;(canvas as any).segmentHeight = height

        renderSegmentationCanvas()
      } catch (error) {
        console.error('Error loading segmentation image:', error)
        imageError.value = true
      } finally {
        imageLoading.value = false
      }
    }

    const renderSegmentationCanvas = () => {
      const canvas = canvasRef.value
      if (!canvas) return

      const ctx = canvas.getContext('2d')!
      const segmentData = (canvas as any).segmentData
      const width = (canvas as any).segmentWidth
      const height = (canvas as any).segmentHeight

      if (!segmentData) return

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      const alpha = Math.round(255 * opticalImageState.segmentOpacity)
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
          imageData.data[pixelIndex + 3] = alpha
        }
      }

      ctx.putImageData(imageData, 0, 0)
    }

    const downloadImage = async () => {
      const canvas = canvasRef.value
      const opticalImg = opticalImageRef.value
      if (!canvas || !segmentationData.value) return

      try {
        // Create a new canvas for the composite image
        const compositeCanvas = document.createElement('canvas')
        const ctx = compositeCanvas.getContext('2d')!

        // Calculate legend dimensions first
        const legendPadding = 16
        const itemHeight = 32
        const itemSpacing = 4
        const colorSwatchSize = 16
        const progressBarWidth = 60
        const legendWidth = 280

        // Only count visible segments for height calculation
        const visibleSegments = segmentationData.value.segment_summary.filter(
          (segment) => !segmentState.hiddenSegments.has(segment.id)
        )

        const legendHeight = legendPadding * 2 + visibleSegments.length * (itemHeight + itemSpacing) - itemSpacing

        // Set canvas size to accommodate both image and legend side by side
        const imageWidth = canvas.width
        const imageHeight = canvas.height
        const spacing = 20 // Space between image and legend
        const canvasWidth = imageWidth + spacing + legendWidth
        const canvasHeight = Math.max(imageHeight, legendHeight)

        compositeCanvas.width = canvasWidth
        compositeCanvas.height = canvasHeight

        // Leave background transparent (no fill needed for transparency)

        // Calculate vertical positioning for image centering
        const imageY = (canvasHeight - imageHeight) / 2

        // Draw optical image if present and visible
        if (opticalImg && props.opticalImage?.url && props.showOpticalImage && !opticalImageError.value) {
          ctx.globalAlpha = opticalImageState.opticalOpacity

          // Apply transformation if needed
          if (props.opticalImage.transform) {
            const t = props.opticalImage.transform
            // Adjust transformation to account for vertical centering
            ctx.setTransform(t[0][0], t[1][0], t[0][1], t[1][1], t[0][2], t[1][2] + imageY)
          } else {
            // Just translate for centering if no transformation
            ctx.setTransform(1, 0, 0, 1, 0, imageY)
          }

          ctx.drawImage(opticalImg, 0, 0)

          // Reset transformation
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.globalAlpha = 1.0
        }

        // Draw segmentation canvas (centered vertically)
        ctx.globalAlpha = opticalImageState.segmentOpacity
        ctx.drawImage(canvas, 0, imageY)
        ctx.globalAlpha = 1.0

        // Don't create legend if no visible segments
        if (visibleSegments.length === 0) {
          // Just download the image without legend
          compositeCanvas.toBlob((blob) => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `segmentation-visualization-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
          }, 'image/png')
          return
        }

        // Create legend canvas
        const legendCanvas = document.createElement('canvas')
        const legendCtx = legendCanvas.getContext('2d')!

        legendCanvas.width = legendWidth
        legendCanvas.height = legendHeight

        // Draw legend background with rounded corners effect
        legendCtx.fillStyle = 'rgba(248, 249, 250, 0.95)'
        legendCtx.fillRect(0, 0, legendWidth, legendHeight)

        // Draw legend border
        legendCtx.strokeStyle = '#e9ecef'
        legendCtx.lineWidth = 1
        legendCtx.strokeRect(0.5, 0.5, legendWidth - 1, legendHeight - 1)

        // Draw legend items
        let yOffset = legendPadding
        visibleSegments.forEach((segment) => {
          const segmentColor = getSegmentColor(segment.id)
          const segmentName = getSegmentName(segment.id)
          const coverage = Math.round(segment.coverage_fraction * 100)

          // Draw color swatch
          legendCtx.fillStyle = segmentColor
          legendCtx.fillRect(
            legendPadding,
            yOffset + (itemHeight - colorSwatchSize) / 2,
            colorSwatchSize,
            colorSwatchSize
          )

          // Draw swatch border
          legendCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
          legendCtx.lineWidth = 1
          legendCtx.strokeRect(
            legendPadding,
            yOffset + (itemHeight - colorSwatchSize) / 2,
            colorSwatchSize,
            colorSwatchSize
          )

          // Draw segment name
          legendCtx.fillStyle = '#343a40'
          legendCtx.font = '600 14px Arial, sans-serif'
          legendCtx.textAlign = 'left'
          legendCtx.textBaseline = 'middle'
          legendCtx.fillText(segmentName, legendPadding + colorSwatchSize + 8, yOffset + itemHeight / 2)

          // Draw progress bar background
          const progressX = legendWidth - legendPadding - progressBarWidth
          const progressY = yOffset + (itemHeight - 16) / 2
          const progressHeight = 16

          legendCtx.fillStyle = 'rgba(0, 0, 0, 0.2)'
          legendCtx.fillRect(progressX, progressY, progressBarWidth, progressHeight)

          // Draw progress bar fill
          const fillWidth = (progressBarWidth * coverage) / 100
          legendCtx.fillStyle = segmentColor
          legendCtx.fillRect(progressX, progressY, fillWidth, progressHeight)

          // Draw progress text
          legendCtx.fillStyle = '#000000'
          legendCtx.font = '600 12px Arial, sans-serif'
          legendCtx.textAlign = 'center'
          legendCtx.fillText(`${coverage}%`, progressX + progressBarWidth / 2, progressY + progressHeight / 2)

          yOffset += itemHeight + itemSpacing
        })

        // Position legend to the right of the image with proper spacing
        const legendX = imageWidth + spacing
        const legendY = (canvasHeight - legendHeight) / 2 // Center vertically

        // Draw legend onto composite canvas
        ctx.drawImage(legendCanvas, legendX, legendY)

        // Convert to blob and download
        compositeCanvas.toBlob((blob) => {
          if (!blob) return

          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `segmentation-visualization-${Date.now()}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }, 'image/png')
      } catch (error) {
        console.error('Error downloading image:', error)
      }
    }

    onMounted(() => {
      nextTick(() => {
        if (labelMapImage.value) {
          loadAndRenderSegmentationImage()
        }
        if (props.opticalImage?.url) {
          loadOpticalImage()
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

    // Watch for optical image changes
    watch(
      () => props.opticalImage?.url,
      (newUrl, oldUrl) => {
        if (newUrl !== oldUrl && newUrl) {
          loadOpticalImage()
        }
      }
    )

    // Watch for optical image state changes to re-render
    watch(
      () => [props.showOpticalImage, opticalImageState.opticalOpacity, opticalImageState.segmentOpacity],
      () => {
        renderSegmentationCanvas()
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

    const renderOpacityControls = () => {
      return (
        <div
          class="opacity-controls"
          onMousedown={(e: MouseEvent) => e.stopPropagation()}
          onWheel={(e: WheelEvent) => e.stopPropagation()}
        >
          <FadeTransition>
            {props.showOpticalImage && (
              <OpacitySettings
                key="opticalOpacity"
                label="Optical image visibility"
                class="opacity-control-item"
                opacity={opticalImageState.opticalOpacity}
                {...{ onOpacity: handleOpticalOpacityChange }}
              />
            )}
          </FadeTransition>
          <FadeTransition>
            <OpacitySettings
              key="segmentOpacity"
              label="Cluster image opacity"
              class="opacity-control-item"
              opacity={opticalImageState.segmentOpacity}
              {...{ onOpacity: handleSegmentOpacityChange }}
            />
          </FadeTransition>
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
          {/* Canvas controls */}
          <div
            class="canvas-controls"
            onMousedown={(e: MouseEvent) => e.stopPropagation()}
            onWheel={(e: WheelEvent) => e.stopPropagation()}
          >
            <ElButton
              size="small"
              class="button-reset rounded-full bg-gray-100 shadow-xs h-8 w-8 flex items-center justify-center"
              onClick={downloadImage}
              title="Download as PNG"
            >
              <ElIcon class="el-icon-download text-xl">
                <Download />
              </ElIcon>
            </ElButton>
          </div>

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

            {/* Shared viewBox: pan/zoom applied here so both layers move together */}
            <div
              ref={viewBoxRef}
              class="segmentation-viewbox"
              style={{ transformOrigin: '0 0', pointerEvents: 'none' }}
            >
              {/* Optical image — background layer (z-index: 1) */}
              {props.opticalImage?.url && props.showOpticalImage && (
                <img
                  ref={opticalImageRef}
                  src={props.opticalImage.url}
                  class="absolute top-0 left-0 origin-top-left"
                  style={{
                    display: imageLoading.value || imageError.value ? 'none' : 'block',
                    opacity: opticalImageState.opticalOpacity,
                    transform: getOpticalImageTransform(),
                    zIndex: 1,
                  }}
                  onLoad={onOpticalImageLoad}
                  onError={onOpticalImageError}
                  crossorigin="anonymous"
                />
              )}

              {/* Hidden img element to keep the ref alive when toggle is off */}
              {props.opticalImage?.url && !props.showOpticalImage && (
                <img
                  ref={opticalImageRef}
                  src={props.opticalImage.url}
                  style={{ display: 'none' }}
                  onLoad={onOpticalImageLoad}
                  onError={onOpticalImageError}
                  crossorigin="anonymous"
                />
              )}

              {/* Segmentation canvas — overlay layer (z-index: 2, above optical) */}
              <canvas
                ref={canvasRef}
                class="segmentation-canvas"
                style={{
                  position: 'relative',
                  display: imageLoading.value || imageError.value ? 'none' : 'block',
                  imageRendering: 'pixelated',
                  zIndex: 2,
                }}
              />
            </div>
          </div>

          {props.opticalImage?.url && props.showOpticalImage && (
            <div
              class="absolute bottom-0 right-0 m-3 flex flex-col gap-2"
              style={{ pointerEvents: 'auto' }}
              onMousedown={(e: MouseEvent) => e.stopPropagation()}
              onWheel={(e: WheelEvent) => e.stopPropagation()}
            >
              {renderOpacityControls()}
            </div>
          )}

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
