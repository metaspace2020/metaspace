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
    <span
      v-else-if="status === 'LOCKED'"
      key="locked"
      class="cursor-not-allowed font-medium text-blue-700"
      title="Locked intensity"
    >
      {{ intensity }}
    </span>
    <clipping-tooltip
      v-else-if="status === 'CLIPPED'"
      key="clipped"
      :clipping-type="clippingType"
      placement="bottom-start"
      :clipped-intensity="intensity"
      :original-intensity="originalIntensity"
      :disabled="tooltipDisabled"
      @click="editing = true"
    />
    <button
      v-else
      key=""
      class="button-reset"
      @click="editing = true"
    >
      {{ intensity }}
    </button>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch } from '@vue/composition-api'

import EditIntensity from './EditIntensity.vue'
import ClippingTooltip from './ClippingTooltip.vue'
import FadeTransition from '../../components/FadeTransition'

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
    ClippingTooltip,
    FadeTransition,
    EditIntensity,
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
