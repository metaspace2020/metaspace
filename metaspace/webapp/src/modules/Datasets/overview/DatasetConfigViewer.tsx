import { defineComponent } from '@vue/composition-api'
import analysisVersionHelp from '../../MetadataEditor/inputs/AnalysisVersionHelp.vue'
import { formatBytes } from '../../../lib/formatBytes'

interface DatasetConfigViewerProps {
  data: any
  acqGeo: any
  fileSize: any
}

export const DatasetConfigViewer = defineComponent<DatasetConfigViewerProps>({
  name: 'DatasetConfigViewer',
  props: {
    data: { type: Object, default: {} },
    acqGeo: { type: Object, default: {} },
    fileSize: { type: Object, default: {} },
  },
  setup(props: DatasetConfigViewerProps) {
    return () => {
      const { image_generation: imageGeneration } = (props.data || {})
      const { pixel_count: pixelCount } = (props.acqGeo || {})
      const { ibd_size: ibdSize, imzml_size: imzmlSize } = (props.fileSize || {})

      return (
        <div class="flex flex-wrap relative -m-3">
          {
            imageGeneration?.ppm
            && <div class="flex-grow box-border min-w-64 p-3 break-words">
              <h3 class='m-0 my-2'>Annotation settings</h3>
              <ul class="list-none p-0 m-0 max-h-40 overflow-y-auto">
                <li><b>m/z tolerance (ppm):</b> {imageGeneration?.ppm}</li>
                { pixelCount && <li><b>Pixel count:</b> {pixelCount}</li>}
                { imzmlSize && <li><b>Imzml file size:</b> {formatBytes(imzmlSize, 2)}</li>}
                { ibdSize && <li><b>Ibd file size:</b> {formatBytes(ibdSize, 2)}</li>}
              </ul>
            </div>
          }
        </div>
      )
    }
  },
})
