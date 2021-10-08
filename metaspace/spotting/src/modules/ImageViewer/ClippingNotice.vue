<template>
  <p class="m-0">
    <span v-if="type === 'hotspot-removal'">
      <b>Hot-spot removal has been applied to this image</b>.
      {{ isNormalized ? 'Relative intensities': 'Intensities' }} above the 99ᵗʰ percentile, {{ maxIntensities.clipped }},
      have been reduced to {{ maxIntensities.clipped }}.
      The highest intensity before hot-spot removal was {{ maxIntensities.original }}.
    </span>
    <span v-if="type === 'outlier-max'">
      <b>Outlier clipping has been applied to this image</b>.
      Intensities above the 99ᵗʰ percentile, {{ maxIntensities.clipped }},
      have been reduced to {{ maxIntensities.clipped }}.
      The highest intensity before outlier clipping was {{ maxIntensities.original }}.
    </span>
    <span v-if="type === 'outlier-min'">
      <b>Outlier clipping has been applied to this image</b>.
      Intensities below the 1ˢᵗ percentile, {{ minIntensities.clipped }},
      have been reduced to {{ minIntensities.clipped }}.
      The lowest intensity before outlier clipping was {{ minIntensities.original }}.
    </span>
  </p>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import { IonImageIntensity } from './ionImageState'

const formatIntensities = (intensities: IonImageIntensity) => {
  return {
    clipped: intensities.clipped.toExponential(1),
    original: intensities.image.toExponential(1),
  }
}

export default defineComponent({
  props: {
    type: String,
    isNormalized: Boolean,
    intensity: { type: Object, required: true },
  },
  setup(props) {
    return {
      minIntensities: computed(() => formatIntensities(props.intensity.min)),
      maxIntensities: computed(() => formatIntensities(props.intensity.max)),
    }
  },
})
</script>
