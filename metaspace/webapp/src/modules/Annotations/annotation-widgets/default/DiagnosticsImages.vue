<template>
    <el-row class="isotope-images-container">
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
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

import ImageLoader from '../../../../components/ImageLoader.vue';
import {sortBy} from 'lodash-es';

@Component({
    components: {
        ImageLoader,
    }
})
export default class DiagnosticsImages extends Vue {
    @Prop()
    annotation: any
    @Prop()
    colormap: any
    @Prop()
    imageLoaderSettings: any

    get sortedIsotopeImages(): any[] {
        // Usually isotope images are pre-sorted by the server, but it's not an explicit guarantee of the API
        return sortBy(this.annotation.isotopeImages, img => img.mz)
          .filter(img => img.mz > 0);
    }
}
</script>

<style lang="scss" scoped>

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

</style>
