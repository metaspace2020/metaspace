<template>
  <el-row class="isotope-images-container tour-isotope-images">
    <el-col v-for="(img, idx) in isotopeImages" :key="annotation.id + idx" :xs="24" :sm="12" :md="12" :lg="6">
      <div class="small-peak-image">
        {{ img.mz.toFixed(4) }}
        <el-popover v-if="img.isobarAlert" trigger="hover" placement="top">
          {{ img.isobarAlert }}
          <template #reference>
            <el-icon name="warning-outline">
              <Warning />
            </el-icon>
          </template>
        </el-popover>
        <br />
        <image-loader
          :src="img.url"
          :colormap="colormap"
          :image-fit-params="{ areaMinHeight: 50, areaHeight: 250 }"
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
import { defineComponent, PropType, computed } from 'vue'
import ImageLoader from '../../../../components/ImageLoader.vue'
import { sortBy } from 'lodash-es'
import { formatHumanReadableList, formatNth } from '../../../../lib/util'
import { ElIcon, ElCol, ElRow, ElPopover } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'
export default defineComponent({
  components: {
    ImageLoader,
    ElIcon,
    Warning,
    ElCol,
    ElPopover,
    ElRow,
  },
  props: {
    annotation: Object as PropType<any>,
    colormap: String,
    imageLoaderSettings: Object,
    isobarPeakNs: Array as PropType<[number, number][] | null>,
  },
  setup(props) {
    const isotopeImages = computed(() => {
      const images = sortBy(props.annotation.isotopeImages, (img) => img.mz)
        .filter((img) => img.mz > 0)
        .map((img, i) => {
          const overlapsPeaks = (props.isobarPeakNs || []).filter(([a]) => a === i + 1).map(([, b]) => b)
          const isobarAlert =
            overlapsPeaks.length > 0
              ? `This peak's detection window overlaps with the other annotation's ${formatHumanReadableList(
                  overlapsPeaks.map(formatNth)
                )}${overlapsPeaks.length > 1 ? ' peaks.' : ' peak.'}`
              : null
          return { ...img, isobarAlert }
        })

      return images
    })

    return {
      isotopeImages,
    }
  },
})
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
