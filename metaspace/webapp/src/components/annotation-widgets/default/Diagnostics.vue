<template>
<div>
    <el-row id="scores-table">
        MSM score =
        <span>{{ annotation.msmScore.toFixed(3) }}</span> =
        <span>{{ annotation.rhoSpatial.toFixed(3) }}</span>
        (&rho;<sub>spatial</sub>) &times;
        <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
        (&rho;<sub>spectral</sub>) &times;
        <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
        (&rho;<sub>chaos</sub>)
    </el-row>
    <el-row id="isotope-images-container">
        <el-col :xs="24" :sm="12" :md="12" :lg="6"
                v-for="(img, idx) in annotation.isotopeImages.filter(img => img.url !== null)"
                :key="idx">
            <div class="small-peak-image">
            {{ img.mz.toFixed(4) }}<br/>
                <image-loader :src="img.url"
                              :colormap="colormap"
                              :max-height=250
                              v-bind="imageLoaderSettings"
                              style="overflow: hidden">
                </image-loader>
            </div>
        </el-col>
    </el-row>
    <el-row id="isotope-plot-container">
        <isotope-pattern-plot :data="peakChartData"
                              :isotopeColors="Array(annotation.isotopeImages.length).fill(sampleIsotopeColor)"
                              :theorColor="theorIsotopeColor">
        </isotope-pattern-plot>
    </el-row>
    <el-row>
        <plot-legend :items="isotopeLegendItems">
        </plot-legend>
    </el-row>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { schemeCategory10 as LegendColors } from 'd3';

import ImageLoader from '../../ImageLoader.vue';
import PlotLegend from '../../PlotLegend.vue';
import IsotopePatternPlot from '../../IsotopePatternPlot.vue';

@Component({
    name: 'diagnostics',
    components: {
        ImageLoader,
        PlotLegend,
        IsotopePatternPlot
    }
})
export default class Diagnostics extends Vue {
    @Prop()
    annotation: any
    @Prop()
    peakChartData: any
    @Prop()
    colormap: any
    @Prop()
    imageLoaderSettings: any

    sampleIsotopeColor: string = 'red'
    theorIsotopeColor: string = 'blue'

    get isotopeLegendItems(): any[] {
        return this.annotation ? [{name: 'Sample', color: this.sampleIsotopeColor, opacity: 1},
                                  {name: 'Theoretical', color: this.theorIsotopeColor, opacity: 0.6}]
                               : [];
    }
}
</script>

<style>
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

#isotope-images-container {
    margin: 10px auto;
    text-align: center;
    font-size: 13px;
}

#isotope-plot-container text {
    font-family: "Roboto" !important;
}
</style>
