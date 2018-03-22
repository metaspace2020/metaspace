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
        <xic-plot :intensityImgs="annotation.isotopeImages"
                  :graphColors="isotopeLegendItems.map(i => i.color)"
                  :acquisitionGeometry="acquisitionGeometry"
                  :logIntensity="true"
                  :showLogIntSwitch="true">
        </xic-plot>
    </el-row>
    <el-row class="diagnostics-section-title">
        <span>Isotope integral intensity</span>
    </el-row>
    <el-row id="isotope-plot-container">
        <isotope-pattern-plot :data="peakChartData"
                              :isotopeColors="isotopeLegendItems.map(i => i.color)"
                              :theorColor="theorIntensityLegendItem.color">
        </isotope-pattern-plot>
    </el-row>
    <el-row>
        <plot-legend :items="isotopeLegendItems.concat(theorIntensityLegendItem)">
        </plot-legend>
    </el-row>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { schemeCategory10 as LegendColors } from 'd3';

import IsotopePatternPlot from '../../IsotopePatternPlot.vue';
import PlotLegend from '../../PlotLegend.vue';
import XicPlot from '../../XicPlot.vue';

@Component({
    name: 'diagnostics',
    components: {
        IsotopePatternPlot,
        PlotLegend,
        XicPlot
    }
})
export default class Diagnostics extends Vue {
    @Prop()
    annotation: any
    @Prop()
    acquisitionGeometry: any
    @Prop()
    peakChartData: any

    get isotopeLegendItems(): any[] {
        return this.annotation ? this.annotation.isotopeImages.map((img: any, idx: number) => {
                                return {
                                  name: img.mz,
                                  color: idx < LegendColors.length ? LegendColors[idx] : 'black',
                                  opacity: 1
                                }
                              }) : [];
    }

    get theorIntensityLegendItem(): any {
        return {name: 'Theoretical', color: '#7D5BA6', opacity: 0.6};
    }
}
</script>

<style>
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

#isotope-plot-container text {
    font-family: "Roboto" !important;
}
</style>
