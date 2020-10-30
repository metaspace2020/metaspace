<template>
  <overlay
    class="w-60 text-xs tracking-wider"
  >
    <fade-transition>
      <div
        v-if="hasOpticalImage"
        key="opacity"
        class="mb-3"
      >
        <p class="leading-6 m-0 flex justify-between">
          <span class="text-gray-700 uppercase">
            Opacity
          </span>
          <span>
            {{ percentage }}%
          </span>
        </p>
        <slider
          class="opacity-gradient"
          :value="percentage"
          :min="0"
          :max="100"
          :step="1"
          @change="emitOpacity"
        />
      </div>
    </fade-transition>
    <p class="leading-6 m-0 flex justify-between items-center sm-leading-trim">
      <span class="text-gray-700 uppercase">
        Lock intensity
      </span>
      <mini-switch
        :disabled="hasLockErrors || !(settings.lockMin.length || settings.lockMax.length)"
        :value="settings.isLockActive && !hasLockErrors"
        @change="settings.isLockActive = !settings.isLockActive"
      />
    </p>
    <div class="flex justify-between">
      <locked-intensity-field
        sr-label="Min intensity"
        :initial-value="settings.lockMin"
        :has-error="lockMinError"
        @submit="value => { settings.lockMin = value; settings.isLockActive = true; }"
      />
      <locked-intensity-field
        sr-label="Max intensity"
        :initial-value="settings.lockMax"
        :has-error="lockMaxError"
        @submit="value => { settings.lockMax = value; settings.isLockActive = true; }"
      />
    </div>
  </overlay>
</template>
<script lang="ts">
import { defineComponent, computed, ref } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import LockedIntensityField from './LockedIntensityField.vue'
import { Slider } from '../../components/Slider'
import FadeTransition from '../../components/FadeTransition'
import MiniSwitch from '../../components/MiniSwitch.vue'

import { useIonImageSettings } from './ionImageState'

const isInvalidLockedIntensity = (value: string) => value.length > 0 && isNaN(parseFloat(value))

export default defineComponent({
  components: {
    Overlay,
    Slider,
    FadeTransition,
    MiniSwitch,
    LockedIntensityField,
  },
  props: {
    hasOpticalImage: Boolean,
    opacity: { type: Number, required: true },
  },
  setup(props, { emit }) {
    const { settings } = useIonImageSettings()

    const lockMinError = computed(() => isInvalidLockedIntensity(settings.lockMin))
    const lockMaxError = computed(() => isInvalidLockedIntensity(settings.lockMax))

    const hasLockErrors = computed(() => lockMinError.value || lockMaxError.value)

    return {
      settings,
      lockMinError,
      lockMaxError,
      hasLockErrors,
      percentage: computed(() => Math.round(props.opacity * 100)),
      emitOpacity(value: number) {
        emit('opacity', value / 100)
      },
    }
  },
})
</script>
<style scoped>
.opacity-gradient {
  background-image:
    linear-gradient(to right, transparent 0%, theme('colors.primary') 66%),
    url('../../assets/checkerboard.png');
  background-repeat: none, repeat-x;
  background-size: 100%, 12px 12px;
}

.sm-leading-trim:first-child {
  margin-top: calc(-1 * theme('spacing.3') / 2); /* hacking */
}
</style>
