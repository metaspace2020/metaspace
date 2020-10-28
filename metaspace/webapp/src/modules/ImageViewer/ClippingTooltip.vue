<template>
  <el-tooltip
    v-model="isOpen"
    :placement="placement"
    manual
  >
    <span
      title="Clipped intensity - click for details"
      class="font-medium text-red-700 cursor-help"
      @click.stop
      @mousedown.stop="toggleTooltip"
      @keypress.enter="toggleTooltip"
      @keypress.space.prevent="toggleTooltip"
      @keypress.esc="closeTooltip"
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

const openTooltip = ref<string | null>(null)

const closeTooltip = () => { openTooltip.value = null }

export default defineComponent({
  props: {
    id: { type: String, required: true },
    clippingType: String,
    clippedIntensity: String,
    originalIntensity: String,
    placement: String,
  },
  setup(props) {
    const isOpen = computed(() => props.id === openTooltip.value)

    watch(isOpen, (open) => {
      if (open) {
        document.addEventListener('mousedown', closeTooltip)
      } else {
        document.removeEventListener('mousedown', closeTooltip)
      }
    })

    return {
      isOpen,
      closeTooltip,
      toggleTooltip() {
        openTooltip.value =
          openTooltip.value === props.id ? null : props.id
      },
    }
  },
})
</script>
