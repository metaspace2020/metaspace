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
    <p
      class="leading-6 m-0 flex justify-between sm-leading-trim"
      @click="show = !show"
    >
      <span class="text-gray-700 uppercase">
        Lock intensity
      </span>
      <el-checkbox>
        <span class="text-xs -ml-2 pl-1">sync sliders</span>
      </el-checkbox>
    </p>
    <form
      class="flex justify-between"
      @submit.prevent
    >
      <label class="relative">
        <span class="sr-only">
          Min intensity
        </span>
        <input
          v-model="lockMin"
          type="text"
          placeholder="min"
          title="Lock minimum intensity"
          :error="lockMinError"
          @keypress.enter="settings.lockMin = lockMin"
        />
        <button
          class="button-reset absolute right-0 w-5 h-5 rounded-sm"
          @click="settings.lockMin = lockMin"
        >
          <ArrowIcon class="sm-icon" />
        </button>
      </label>
      <label class="relative">
        <span class="sr-only">
          Max intensity
        </span>
        <input
          v-model="lockMax"
          type="text"
          placeholder="max"
          title="Lock maximum intensity"
          :error="lockMaxError"
          @keypress.enter="settings.lockMax = lockMax"
        />
        <button
          class="button-reset absolute right-0 w-5 h-5 rounded-sm"
          @click="settings.lockMax = lockMax"
        >
          <ArrowIcon class="sm-icon" />
        </button>
      </label>
    </form>
  </overlay>
</template>
<script lang="ts">
import { defineComponent, computed, ref } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import { Slider } from '../../components/Slider'
import FadeTransition from '../../components/FadeTransition'

import ArrowIcon from '../../assets/inline/refactoring-ui/arrow-thin-right-circle.svg'

import { useIonImageSettings } from './ionImageState'

export default defineComponent({
  components: {
    Overlay,
    Slider,
    FadeTransition,
    ArrowIcon,
  },
  props: {
    hasOpticalImage: Boolean,
    opacity: { type: Number, required: true },
  },
  setup(props, { emit }) {
    const settings = useIonImageSettings()
    console.log(settings)
    return {
      settings,
      lockMin: ref(settings.lockMin),
      lockMax: ref(settings.lockMax),
      lockMinError: computed(() => settings.lockMin.length > 0 && isNaN(parseFloat(settings.lockMin))),
      lockMaxError: computed(() => settings.lockMax.length > 0 && isNaN(parseFloat(settings.lockMax))),
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

form label {
  width: calc(50% - 6px);
}

input {
  @apply
    w-full
    h-6
    border
    border-solid
    text-body
    border-gray-300
    bg-white
    pl-2
    pr-6
    box-border
    rounded-sm
    tracking-wider
    transition-colors
    duration-150
    ease-in-out;
  outline: none;
}
input::placeholder {
  @apply text-gray-600;
}
input:hover {
  @apply border-gray-500;
}
input:focus {
  @apply border-primary;
}
input[error] {
  @apply border-danger;
}

.sm-icon {
  @apply w-6 h-6 absolute;
  top: -2px;
  left: -2px;
}

.sm-icon {
  @apply fill-current text-gray-600;
}
.sm-icon .secondary {
  display: none;
}

button {
  margin: 2px;
}

button:hover,
button:focus {
  @apply bg-blue-300;
  outline: none;
}

button:hover .sm-icon,
button:focus .sm-icon {
  @apply text-blue-800;
}
</style>
