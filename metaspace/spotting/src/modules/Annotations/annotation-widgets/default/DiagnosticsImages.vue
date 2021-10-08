<template>
  <el-row class="isotope-images-container tour-isotope-images">
    <el-col
      v-for="(img, idx) in isotopeImages"
      :key="annotation.id + idx"
      :xs="24"
      :sm="12"
      :md="12"
      :lg="6"
    >
      <div class="small-peak-image">
        {{ img.mz.toFixed(4) }}
        <el-popover
          v-if="img.isobarAlert"
          trigger="hover"
          placement="top"
        >
          {{ img.isobarAlert }}
          <el-icon
            slot="reference"
            name="warning-outline"
          />
        </el-popover>
        <br>
        <image-loader
          :src="img.url"
          :colormap="colormap"
          :image-fit-params="{areaMinHeight: 50, areaHeight: 250}"
          v-bind="imageLoaderSettings"
          style="overflow: hidden"
          :min-intensity="img.minIntensity"
          :max-intensity="img.maxIntensity"
          show-pixel-intensity
        />
      </div>
    </el-col>
  </el-row>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

import ImageLoader from '../../../../components/ImageLoader.vue'
import { groupBy, sortBy } from 'lodash-es'
import { formatHumanReadableList, formatNth } from '../../../../lib/util'

@Component({
  components: {
    ImageLoader,
  },
})
export default class DiagnosticsImages extends Vue {
    @Prop()
    annotation: any

    @Prop()
    colormap: any

    @Prop()
    imageLoaderSettings: any

    @Prop()
    isobarPeakNs!: [number, number][] | null

    get isotopeImages(): any[] {
      const images = sortBy(this.annotation.isotopeImages, img => img.mz)
        .filter(img => img.mz > 0)
        .map((img, i) => {
          // Add info about peaks that overlap with an isobaric annotation
          const overlapsPeaks = (this.isobarPeakNs || [])
            .filter(([a, b]) => a === i + 1)
            .map(([a, b]) => b)
          const isobarAlert = overlapsPeaks.length > 0
            ? 'This peak\'s detection window overlaps with the other annotation\'s '
                  + formatHumanReadableList(overlapsPeaks.map(formatNth))
                  + (overlapsPeaks.length > 1 ? ' peaks.' : ' peak.')
            : null
          return { ...img, isobarAlert }
        })

      return images
    }
}
</script>

<style lang="scss" scoped>

.isotope-images-container {
    margin: 10px auto;
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
