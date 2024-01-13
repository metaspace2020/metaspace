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
        @click="settings.isLockActive = !settings.isLockActive"
      />
    </p>
    <div class="flex justify-between">
      <locked-intensity-field
        v-model="settings.lockMin"
        label="Minimum intensity"
        placeholder="min."
      />
      <locked-intensity-field
        v-model="settings.lockMax"
        label="Maximum intensity"
        placeholder="max."
      />
    </div>
  </overlay>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

import Overlay from './Overlay.vue'
import LockedIntensityField from './LockedIntensityField.vue'
import MiniSwitch from '../../components/MiniSwitch.vue'

import { useIonImageSettings } from './ionImageState'

export default defineComponent({
  components: {
    Overlay,
    MiniSwitch,
    LockedIntensityField,
  },
  props: {
    hasOpticalImage: Boolean,
    isSwitchDisabled: Boolean,
    opacity: { type: Number, required: true },
  },
  setup() {
    const { settings } = useIonImageSettings()
    return {
      settings,
    }
  },
})
</script>
