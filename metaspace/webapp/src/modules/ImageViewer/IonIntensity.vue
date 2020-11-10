<template>
  <fade-transition>
    <edit-intensity
      v-if="editing"
      key="edit"
      class="w-20 mt-1"
      :placeholder="placeholder"
      :initial-value="intensity"
      @submit="submit"
      @reset="reset"
      @close="editing = false"
    />
    <div
      v-else
      class="flex sm-direction"
    >
      <span
        v-if="status === 'LOCKED'"
        key="locked"
        class="cursor-not-allowed font-medium text-blue-700"
        title="Locked intensity"
      >
        {{ intensity }}
      </span>
      <el-tooltip
        v-else
        :disabled="tooltipDisabled || status !== 'CLIPPED'"
      >
        <button
          title="Click to edit"
          class="button-reset leading-3"
          :class="{ 'font-medium text-red-700': status === 'CLIPPED', 'cursor-default': tooltipDisabled }"
          @click="editing = true"
        >
          {{ intensity }}
        </button>
        <p
          slot="content"
          class="m-0 text-sm leading-5 max-w-measure-3"
          @mousedown.stop
        >
          <span v-if="clippingType == 'hotspot-removal'">
            <b>Hot-spot removal has been applied to this image.</b> <br>
            Intensities above the 99th percentile, {{ intensity }},
            have been reduced to {{ intensity }}.
            The highest intensity before hot-spot removal was {{ originalIntensity }}.
          </span>
          <span v-if="clippingType == 'outlier-max'">
            <b>Outlier clipping has been applied to this image.</b> <br>
            Intensities above the 99th percentile, {{ intensity }},
            have been reduced to {{ intensity }}.
            The highest intensity before outlier clipping was {{ originalIntensity }}.
          </span>
          <span v-if="clippingType == 'outlier-min'">
            <b>Outlier clipping has been applied to this image.</b> <br>
            Intensities below the 1st percentile, {{ intensity }},
            have been increased to {{ intensity }}.
            The lowest intensity before outlier clipping was {{ originalIntensity }}.
          </span>
        </p>
      </el-tooltip>
      <button
        class="button-reset leading-3 mx-1"
        title="Lock intensity"
        @click.stop="$emit('lock', status === 'LOCKED' ? '' : intensity)"
      >
        <lock-icon
          class="sm-stateful-icon"
          :class="{ 'sm-stateful-icon--active': status === 'LOCKED' }"
        />
      </button>
    </div>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch } from '@vue/composition-api'

import EditIntensity from './EditIntensity.vue'
import FadeTransition from '../../components/FadeTransition'

import '../../components/StatefulIcon.css'
import LockIcon from '../../assets/inline/refactoring-ui/lock.svg'

interface Props {
  clippingType: string
  label: string
  originalValue: number
  placeholder: string
  status: 'LOCKED' | 'CLIPPED' | undefined
  tooltipDisabled: boolean
  value: number
}

export default defineComponent<Props>({
  props: {
    clippingType: String,
    label: String,
    originalValue: Number,
    placeholder: String,
    status: String,
    tooltipDisabled: Boolean,
    value: Number,
  },
  components: {
    FadeTransition,
    EditIntensity,
    LockIcon,
  },
  setup(props, { emit }) {
    const editing = ref(false)

    const intensity = computed(() => props.value.toExponential(1))
    const originalIntensity = computed(() => props.originalValue.toExponential(1))

    return {
      intensity,
      originalIntensity,
      editing,
      submit(floatValue: number) {
        emit('input', floatValue)
        editing.value = false
      },
      reset() {
        emit('input', props.originalValue)
        editing.value = false
      },
    }
  },
})
</script>
<style scoped>
  .sm-stateful-icon {
    @apply h-4 w-4;
  }
  .sm-direction:last-child {
    flex-direction: row-reverse;
  }
</style>
