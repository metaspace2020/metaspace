<template>
  <div class="relative">
    <el-row id="isotope-plot-container" class="relative w-full">
      <isotope-pattern-plot :data="plotData" :legend-items="isotopeLegendItems" />
    </el-row>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'
import IsotopePatternPlot from './IsotopePatternPlot.vue'
import { renderMolFormulaHtml } from '../../../lib/util'
import { ElRow } from '../../../lib/element-plus'

export default defineComponent({
  name: 'DiagnosticsPlot',
  components: {
    IsotopePatternPlot,
    ElRow,
  },
  props: {
    peakChartData: [Object, String],
    ion: [Object, String],
    comparisonPeakChartData: [Object, String],
    comparisonIon: [Object, String],
  },
  setup(props: any) {
    const isotopeLegendItems = computed(() => {
      if (props.peakChartData != null) {
        const ionHtml = renderMolFormulaHtml(props.ion)
        if (props.comparisonPeakChartData != null) {
          const compIonHtml = renderMolFormulaHtml(props.comparisonIon)
          return [
            { labelHtml: `${ionHtml}<br> Theoretical`, cssClass: 'refTheor', type: 'theor' },
            { labelHtml: `${ionHtml}<br> Sample`, cssClass: 'refSample', type: 'sample' },
            { labelHtml: `${compIonHtml}<br> Theoretical`, cssClass: 'compTheor', type: 'theor' },
            { labelHtml: `${compIonHtml}<br> Sample`, cssClass: 'compSample', type: 'sample' },
          ]
        } else {
          return [
            { labelHtml: 'Theoretical', cssClass: 'soloTheor', type: 'theor' },
            { labelHtml: 'Sample', cssClass: 'soloSample', type: 'sample' },
          ]
        }
      } else {
        return []
      }
    })

    const plotData = computed(() => {
      if (!props.peakChartData) {
        return null
      }
      const { sampleData, theor, ppm } = props.peakChartData
      const sampleDatas = [sampleData]
      const theors = [theor]
      if (props.comparisonPeakChartData) {
        sampleDatas.push(props.comparisonPeakChartData.sampleData)
        theors.push(props.comparisonPeakChartData.theor)
      }

      return {
        sampleDatas,
        theors,
        ppm,
        sampleClasses: props.comparisonPeakChartData ? ['refSample', 'compSample'] : ['soloSample'],
        theorClasses: props.comparisonPeakChartData ? ['refTheor', 'compTheor'] : ['soloTheor'],
      }
    })

    return {
      isotopeLegendItems,
      plotData,
    }
  },
})
</script>

<style lang="scss" scoped>
$refColor: rgb(72, 120, 208);
$compColor: rgb(214, 95, 95);
#isotope-plot-container ::v-deep(.soloSample) {
  circle {
    fill: rgba($compColor, 0.75);
  }
  line {
    stroke: rgba($compColor, 0.75);
  }
  rect {
    fill: rgba($compColor, 0.2);
  }
}
#isotope-plot-container ::v-deep(.soloTheor) {
  path {
    stroke: rgba($refColor, 0.75);
  }
}

#isotope-plot-container ::v-deep(.refSample) {
  circle {
    fill: rgba($refColor, 0.75);
  }
  line {
    stroke: rgba($refColor, 0.75);
  }
  rect {
    fill: rgba($refColor, 0.2);
  }
}
#isotope-plot-container ::v-deep(.refTheor) {
  path {
    stroke: rgba($refColor, 0.75);
  }
}

#isotope-plot-container ::v-deep(.compSample) {
  circle {
    fill: rgba($compColor, 0.75);
  }
  line {
    stroke: rgba($compColor, 0.75);
    stroke-dasharray: 5, 5;
  }
  rect {
    fill: rgba($compColor, 0.2);
    mask: url(#mask-stripe);
  }
}
#isotope-plot-container ::v-deep(.compTheor) {
  path {
    stroke: rgba($compColor, 0.75);
    stroke-dasharray: 5, 5;
  }
}
</style>
