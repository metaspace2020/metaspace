<template>
    <div>
        <el-row id="isotope-plot-container">
            <isotope-pattern-plot :data="plotData" />
        </el-row>
        <el-row>
            <plot-legend :items="isotopeLegendItems" />
        </el-row>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

import PlotLegend from '../PlotLegend.vue';
import IsotopePatternPlot from '../IsotopePatternPlot.vue';

@Component({
    components: {
        PlotLegend,
        IsotopePatternPlot
    }
})
export default class Diagnostics extends Vue {
    @Prop()
    peakChartData: any
    @Prop()
    comparisonPeakChartData: any

    sampleIsotopeColor: string = 'red'
    theorIsotopeColor: string = 'blue'
    comparisonIsotopeColor: string = 'blue'

    get isotopeLegendItems(): any[] {
        return this.peakChartData ? [
          {name: 'Sample', color: this.sampleIsotopeColor, opacity: 1},
          {name: 'Theoretical', color: this.theorIsotopeColor, opacity: 0.6}]
                               : [];
    }

    get plotData(): any {
        if (!this.peakChartData) {
            return null;
        }
        const {sampleData, theor, ppm} = this.peakChartData;
        const sampleDatas = [sampleData];
        const theors = [theor];
        if (this.comparisonPeakChartData) {
            sampleDatas.push(this.comparisonPeakChartData.sampleData);
            theors.push(this.comparisonPeakChartData.theor);
        }

        return {
            sampleDatas,
            theors,
            ppm,
            sampleClasses: ['refSample', 'compSample'],
            theorClasses: ['refTheor', 'compTheor'],
        }
    }
}
</script>

<style lang="scss" scoped>
    $refColor: rgb(72, 120, 208);
    $compColor: rgb(214, 95, 95);
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
