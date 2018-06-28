<template>
<el-row id="xic-plot-container">
    <xic-plot :intensityImgs="[annotation.isotopeImages[0]]"
              :graphColors="graphColors"
              :acquisitionGeometry="acquisitionGeometry">
    </xic-plot>
</el-row>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { schemeCategory10 as LegendColors } from 'd3';

import XicPlot from '../../XicPlot.vue';

@Component({
    name: 'main-image',
    components: { XicPlot }
})
export default class MainImage extends Vue {
    @Prop()
    annotation: any
    @Prop()
    acquisitionGeometry: any

    get graphColors(): string[] {
        return [LegendColors[0]];
    }
}
</script>

<style>
#xic-plot-container {
    font-size: 1rem;
    text-align: center;
}
</style>
