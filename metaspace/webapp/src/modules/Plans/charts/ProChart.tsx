import { defineComponent, onMounted, ref, PropType } from 'vue'
import { CHART_DRAWERS, ProChartKind } from './proCharts'

export default defineComponent({
  name: 'ProChart',
  props: {
    kind: { type: String as PropType<ProChartKind>, required: true },
    caption: { type: String, default: '' },
  },
  setup(props) {
    const svgRef = ref<SVGSVGElement | null>(null)

    onMounted(() => {
      if (!svgRef.value) {
        return
      }
      try {
        CHART_DRAWERS[props.kind](svgRef.value)
      } catch (e) {
        // Decorative only - leave the sized, empty svg rather than break layout.
      }
    })

    return () => (
      <div class="pro-chart">
        <svg ref={svgRef} viewBox="0 0 520 300" aria-hidden="true" class="pro-chart__svg" />
        {props.caption && <div class="pro-chart__caption">{props.caption}</div>}
      </div>
    )
  },
})
