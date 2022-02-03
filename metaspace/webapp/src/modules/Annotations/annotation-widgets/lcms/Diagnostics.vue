<template>
  <div>
    <el-row id="scores-table">
      MSM score =
      <span>{{ annotation.msmScore.toFixed(3) }}</span> =
      <span>{{ annotation.rhoSpatial.toFixed(3) }}</span>
      (&rho;<sub>chromatography</sub>) &times;
      <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
      (&rho;<sub>spectral</sub>) &times;
      <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
      (&rho;<sub>chaos</sub>)
    </el-row>
    <el-row class="diagnostics-section-title">
      <span>Isotope XICs</span>
    </el-row>
    <el-row id="isotope-xic-container">
      <xic-plot
        :intensity-imgs="annotation.isotopeImages"
        :graph-colors="isotopeLegendItems.map(i => i.color)"
        :acquisition-geometry="acquisitionGeometry"
        :log-intensity="true"
        :show-log-int-switch="true"
      />
    </el-row>
    <el-row class="diagnostics-section-title">
      <span>Isotope integral intensity</span>
    </el-row>
    <el-row id="isotope-plot-container">
      <diagnostics-plot
        :peak-chart-data="peakChartData"
        :ion="annotation.ion"
      />
    </el-row>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { schemeCategory10 as LegendColors } from 'd3-scale-chromatic'

import DiagnosticsPlot from '../DiagnosticsPlot.vue'
import PlotLegend from '../PlotLegend.vue'
import XicPlot from './XicPlot.vue'
import { diagnosticsDataQuery } from '../../../../api/annotation'
import safeJsonParse from '../../../../lib/safeJsonParse'

@Component({
  name: 'diagnostics',
  components: {
    DiagnosticsPlot,
    PlotLegend,
    XicPlot,
  },
  apollo: {
    peakChartData: {
      query: diagnosticsDataQuery,
      fetchPolicy: 'cache-first',
      update: (data: any) => {
        const { annotation } = data
        if (annotation != null) {
          return safeJsonParse(annotation.peakChartData)
        } else {
          return null
        }
      },
      variables(): any {
        return {
          id: this.annotation.id,
        }
      },
    },
  },
})
export default class Diagnostics extends Vue {
    @Prop()
    annotation: any

    @Prop()
    acquisitionGeometry: any

    peakChartData: any

    get isotopeLegendItems(): any[] {
      return this.annotation ? this.annotation.isotopeImages.map((img: any, idx: number) => {
        return {
          name: img.mz,
          color: idx < LegendColors.length ? LegendColors[idx] : 'black',
          opacity: 1,
        }
      }) : []
    }

    get theorIntensityLegendItem(): any {
      return { name: 'Theoretical', color: '#7D5BA6', opacity: 0.6 }
    }
}
</script>

<style scoped>
.diagnostics-section-title {
    margin: 10px auto;
    text-align: center;
    font-size: 16px;
}

#isotope-xic-container {
    margin: 10px auto;
    text-align: center;
    font-size: 13px;
}

#scores-table {
    border-collapse: collapse;
    border: 1px solid lightblue;
    font-size: 16px;
    text-align: center;
    padding: 3px;
}

#scores-table > span {
    color: blue;
}

</style>
