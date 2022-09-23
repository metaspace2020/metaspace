import { defineComponent } from '@vue/composition-api'
import analysisVersionHelp from '../../MetadataEditor/inputs/AnalysisVersionHelp.vue'

interface DatasetConfigViewerProps {
  data: any
}

export const DatasetConfigViewer = defineComponent<DatasetConfigViewerProps>({
  name: 'DatasetConfigViewer',
  props: {
    data: { type: Object, default: {} },
  },
  setup(props: DatasetConfigViewerProps) {
    const getAnalysisVersion = (analysisVersion: number) => {
      switch (analysisVersion) {
        case 3:
          return 'v2 (ML-powered MSM)'
        case 2:
          return 'v1.5 (Prototype for higher RPs)'
        default:
          return 'v1 (Original MSM)'
      }
    }

    return () => {
      const {
        image_generation: imageGeneration, isotope_generation: isotopeGeneration,
        analysis_version: analysisVersion,
      } = (props.data || {})
      const { chem_mods: chemMods, adducts, neutral_losses: neutralLosses } = (isotopeGeneration || {})

      return (
        <div class="flex flex-wrap relative -m-3">
          <div class="flex-grow box-border min-w-64 p-3 break-words">
            <h3 class='m-0 my-2'>Annotation settings</h3>
            <ul class="list-none p-0 m-0 max-h-40 overflow-y-auto">
              <li ><b>m/z tolerance (ppm):</b> {imageGeneration?.ppm}</li>
            </ul>
          </div>
        </div>
      )
    }
  },
})
