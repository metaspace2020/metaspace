<template>
  <div>
    <el-row>
      <xic-plot
        v-if="annotations"
        :intensity-imgs="annotations.map(a => a.isotopeImages[0])"
        :graph-colors="adductColors"
        :acquisition-geometry="acquisitionGeometry"
        :log-intensity="true"
        :show-log-int-switch="true"
      />
    </el-row>
    <plot-legend :items="adductLegendItems" />
  </div>
</template>

<script>
import { schemeCategory10 as graphColors } from 'd3-scale-chromatic'
import { renderMolFormulaHtml } from '../../../../lib/util'
import XicPlot from './XicPlot.vue'
import PlotLegend from '../PlotLegend.vue'
import { relatedAnnotationsQuery } from '../../../../api/annotation'

export default {
  components: {
    PlotLegend,
    XicPlot,
  },
  props: ['query', 'annotation', 'databaseId', 'acquisitionGeometry'],
  apollo: {
    annotations: {
      query: relatedAnnotationsQuery,
      variables() {
        let filter
        if (this.query === 'allAdducts') {
          filter = { databaseId: this.databaseId, sumFormula: this.annotation.sumFormula }
        } else if (this.query === 'colocalized') {
          filter = { databaseId: this.databaseId, colocalizedWith: this.annotation.id }
        }
        return { datasetId: this.annotation.dataset.id, filter }
      },
      update: data => data.allAnnotations.slice().sort((a, b) => a.mz - b.mz),
    },
  },
  computed: {
    adductColors() {
      if (!this.annotations) {
        return []
      }
      // no adducts apart from current annotation
      if (this.annotations.length === 1) {
        return [graphColors[0]]
      }
      // taking last colors from the palette
      const colors = graphColors.slice(-this.annotations.length + 1)
      // replacing color of the current annotation with the 1st palette color
      const curAnnIdx = this.annotations.findIndex(a => a.adduct === this.annotation.adduct)
      colors.splice(curAnnIdx, 0, graphColors[0])
      return colors
    },
    adductLegendItems() {
      if (!this.annotations) {
        return []
      }
      const colors = this.adductColors
      return this.annotations.map((a, idx) => {
        return {
          name: this.showAdduct(a),
          color: colors[idx],
          opacity: 1,
        }
      })
    },
  },
  methods: {
    showAdduct(annotation) {
      return `<span>${renderMolFormulaHtml(this.annotation.ion)}</span><br/>
              ${annotation.mz.toFixed(4)}<br/>
              <span style="font-size: smaller">
                MSM score: ${annotation.msmScore.toFixed(3)}<br/>
                Annotated @ ${annotation.fdrLevel * 100}% FDR<br/>
                Max. intensity: ${annotation.isotopeImages[0].maxIntensity.toExponential(2)}
              </div>`
    },
  },
}
</script>
