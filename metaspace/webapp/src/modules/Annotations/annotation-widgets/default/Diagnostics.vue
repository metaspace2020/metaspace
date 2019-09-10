<template>
<div>
    <el-row id="scores-table">
        <div class="msm-score-calc">
            MSM score =
            <span>{{ annotation.msmScore.toFixed(3) }}</span> =
            <span>{{ annotation.rhoSpatial.toFixed(3) }}</span>
            (&rho;<sub>spatial</sub>) &times;
            <span>{{ annotation.rhoSpectral.toFixed(3) }}</span>
            (&rho;<sub>spectral</sub>) &times;
            <span>{{ annotation.rhoChaos.toFixed(3) }}</span>
            (&rho;<sub>chaos</sub>)
        </div>
        <div v-if="showOffSample">
            <el-popover trigger="hover" :open-delay="100">
                Image analysis gave an off-sample probability of {{formattedOffSampleProb}}.
                <span slot="reference" :class="annotation.offSample ? 'off-sample-tag' : 'on-sample-tag'">
                    {{annotation.offSample ? 'Off-sample' : 'On-sample'}}
                </span>
            </el-popover>
        </div>
    </el-row>
    <el-row id="isotope-images-container">
        <el-col :xs="24" :sm="12" :md="12" :lg="6"
                v-for="(img, idx) in sortedIsotopeImages"
                :key="annotation.id + idx">
            <div class="small-peak-image">
            {{ img.mz.toFixed(4) }}<br/>
                <image-loader :src="img.url"
                              :colormap="colormap"
                              :imageFitParams="{areaMinHeight: 50, areaHeight: 250}"
                              v-bind="imageLoaderSettings"
                              style="overflow: hidden"
                              :minIntensity="img.minIntensity"
                              :maxIntensity="img.maxIntensity"
                              showPixelIntensity
                />
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

import ImageLoader from '../../../../components/ImageLoader.vue';
import PlotLegend from '../PlotLegend.vue';
import IsotopePatternPlot from '../IsotopePatternPlot.vue';
import {sortBy} from 'lodash-es';
import config from '../../../../config'

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

    get sortedIsotopeImages(): any[] {
        // Usually isotope images are pre-sorted by the server, but it's not an explicit guarantee of the API
        return sortBy(this.annotation.isotopeImages, img => img.mz)
          .filter(img => img.mz > 0);
    }

    get showOffSample(): boolean {
        return config.features.off_sample && this.annotation.offSample != null;
    }

    get formattedOffSampleProb(): string {
        if (this.annotation.offSampleProb < 0.1) {
            return 'less than 10%';
        } else if (this.annotation.offSampleProb > 0.9) {
            return 'greater than 90%';
        } else {
            return (+this.annotation.offSampleProb * 100).toFixed(0) + '%'
        }
    }
}
</script>

<style lang="scss" scoped>
@import "~element-ui/packages/theme-chalk/src/common/var";

#scores-table {
    display: flex;
    border-collapse: collapse;
    border: 1px solid lightblue;
    font-size: 16px;
    padding: 3px 10px;
    align-items: center;
}

.msm-score-calc {
    text-align: center;
    flex-grow: 1;
    justify-content: center;
}

.msm-score-calc > span {
    color: blue;
}

#isotope-images-container {
    margin: 10px auto;
    text-align: center;
    font-size: 13px;
}

.small-peak-image {
    font-size: 1rem;
    vertical-align: top;
    padding: 0 5px 0 5px;
    text-align: center;
    flex: 0 1 260px;
    box-sizing: border-box;

    @media (max-width: 768px) {
        flex-basis: 100%;
    }
}

    .off-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-warning;
        border-radius: 3px;
    }
    .on-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-success;
        border-radius: 3px;
    }
</style>
