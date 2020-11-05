<template>
  <overlay class="text-xs tracking-wider">
    <p class="leading-6 m-0 flex justify-between items-center">
      <span class="text-gray-700 font-medium">
        Lock intensity
      </span>
      <!-- z-index added for focus outline below -->
      <mini-switch
        class="relative z-10"
        :disabled="isSwitchDisabled"
        :value="settings.isLockActive && !isSwitchDisabled"
        @change="settings.isLockActive = !settings.isLockActive"
      />
    </p>
    <div class="flex justify-between">
      <locked-intensity-field
        label="Minimum intensity"
        placeholder="min."
        :stored-value="settings.lockMin"
        :has-error="lockMinError"
        @submit="value => { settings.lockMin = value; settings.isLockActive = true; }"
      />
      <locked-intensity-field
        label="Maximum intensity"
        placeholder="max."
        :stored-value="settings.lockMax"
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
import FadeTransition from '../../components/FadeTransition'
import MiniSwitch from '../../components/MiniSwitch.vue'

import { useIonImageSettings } from './ionImageState'

const isInvalidIntensity = (value: string) => value.length > 0 && isNaN(parseFloat(value))

export default defineComponent({
  components: {
    Overlay,
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

    const lockMinError = computed(() => isInvalidIntensity(settings.lockMin))
    const lockMaxError = computed(() => isInvalidIntensity(settings.lockMax))

    const hasLockErrors = computed(() => lockMinError.value || lockMaxError.value)
    const isSwitchDisabled = computed(() =>
      hasLockErrors.value || !(settings.lockMin.length || settings.lockMax.length),
    )

    return {
      settings,
      lockMinError,
      lockMaxError,
      hasLockErrors,
      isSwitchDisabled,
    }
  },
})
</script>
