import { defineComponent, onMounted, ref } from 'vue'
import { drawSignatureStrip } from './signatureStripDrawing'

const ARIA_LABEL =
  'Four panels. Top left, a centroided mass spectrum, its peaks drawn as sticks with a dot at each apex and the ' +
  'base peak labelled m/z 760.5851. Top right, the annotated ion image for that m/z in viridis, with two regions ' +
  'of interest, ROI A and ROI B, at a false discovery rate of 5 percent or better. Bottom right, a differential ' +
  'test comparing those two regions, 14 metabolites below q 0.05. Bottom left, a cross-dataset heatmap over 40 ' +
  'datasets in three conditions: control, treated and recovery.'

export default defineComponent({
  name: 'SignatureStrip',
  setup() {
    const svgRef = ref<SVGSVGElement | null>(null)

    onMounted(() => {
      if (!svgRef.value) {
        return
      }
      try {
        drawSignatureStrip(svgRef.value)
      } catch (e) {
        // Decorative only - leave the sized, empty svg rather than break layout.
      }
    })

    return () => <svg ref={svgRef} class="pro-signature" role="img" aria-label={ARIA_LABEL} />
  },
})
