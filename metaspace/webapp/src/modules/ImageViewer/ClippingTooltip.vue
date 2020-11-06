<template>
  <el-tooltip
    :disabled="disabled"
    :placement="placement"
  >
    <span
      class="font-medium text-red-700"
      :class="{ 'cursor-pointer': !disabled }"
    >
      {{ clippedIntensity }}
    </span>
    <p
      slot="content"
      class="m-0 text-sm leading-5 max-w-measure-3"
      @mousedown.stop
    >
      <span v-if="clippingType == 'hotspot-removal'">
        <b>Hot-spot removal has been applied to this image.</b> <br>
        Intensities above the 99th percentile, {{ clippedIntensity }},
        have been reduced to {{ clippedIntensity }}.
        The highest intensity before hot-spot removal was {{ originalIntensity }}.
      </span>
      <span v-if="clippingType == 'outlier-max'">
        <b>Outlier clipping has been applied to this image.</b> <br>
        Intensities above the 99th percentile, {{ clippedIntensity }},
        have been reduced to {{ clippedIntensity }}.
        The highest intensity before outlier clipping was {{ originalIntensity }}.
      </span>
      <span v-if="clippingType == 'outlier-min'">
        <b>Outlier clipping has been applied to this image.</b> <br>
        Intensities below the 1st percentile, {{ clippedIntensity }},
        have been increased to {{ clippedIntensity }}.
        The lowest intensity before outlier clipping was {{ originalIntensity }}.
      </span>
    </p>
  </el-tooltip>
</template>
<script lang="ts">
import { defineComponent, ref, watch, computed } from '@vue/composition-api'

export default defineComponent({
  props: {
    clippingType: String,
    clippedIntensity: String,
    originalIntensity: String,
    placement: String,
    disabled: Boolean,
  },
})
</script>
