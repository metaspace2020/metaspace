<template>
  <div>
    <el-row id="isotope-plot-container">
      <isotope-pattern-plot
        :data="plotData"
        :legend-items="isotopeLegendItems"
      />
    </el-row>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

import IsotopePatternPlot from './IsotopePatternPlot.vue'
import { renderMolFormulaHtml } from '../../../lib/util'

@Component({
  components: {
    IsotopePatternPlot,
  },
})
export default class DiagnosticsPlot extends Vue {
    @Prop()
    peakChartData: any;

    @Prop()
    ion: any;

    @Prop()
    comparisonPeakChartData: any;

    @Prop()
    comparisonIon: any;

    get isotopeLegendItems(): any[] {
      if (this.peakChartData != null) {
        const ionHtml = renderMolFormulaHtml(this.ion)
        if (this.comparisonPeakChartData != null) {
          const compIonHtml = renderMolFormulaHtml(this.comparisonIon)
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
    }

    get plotData(): any {
      if (!this.peakChartData) {
        return null
      }
      const { sampleData, theor, ppm } = this.peakChartData
      const sampleDatas = [sampleData]
      const theors = [theor]
      if (this.comparisonPeakChartData) {
        sampleDatas.push(this.comparisonPeakChartData.sampleData)
        theors.push(this.comparisonPeakChartData.theor)
      }

      return {
        sampleDatas,
        theors,
        ppm,
        sampleClasses: this.comparisonPeakChartData ? ['refSample', 'compSample'] : ['soloSample'],
        theorClasses: this.comparisonPeakChartData ? ['refTheor', 'compTheor'] : ['soloTheor'],
      }
    }
}
</script>

<style lang="scss" scoped>
    $refColor: rgb(72, 120, 208);
    $compColor: rgb(214, 95, 95);
    #isotope-plot-container /deep/ .soloSample {
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
    #isotope-plot-container /deep/ .soloTheor {
        path {
            stroke: rgba($refColor, 0.75);
        }
    }

    #isotope-plot-container /deep/ .refSample {
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
    #isotope-plot-container /deep/ .refTheor {
        path {
            stroke: rgba($refColor, 0.75);
        }
    }

    #isotope-plot-container /deep/ .compSample {
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
    #isotope-plot-container /deep/ .compTheor {
        path {
            stroke: rgba($compColor, 0.75);
            stroke-dasharray: 5, 5;
        }
    }
</style>
