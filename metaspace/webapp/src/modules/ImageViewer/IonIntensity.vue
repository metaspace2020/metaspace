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
      class="flex items-center sm-flex-direction"
    >
      <el-tooltip :disabled="tooltipDisabled || status !== 'CLIPPED'">
        <button
          title="Click to edit"
          class="button-reset h-4 leading-5"
          :class="{
            'font-medium text-red-700': status === 'CLIPPED',
            'font-medium text-blue-700': status === 'LOCKED',
            'cursor-default': tooltipDisabled
          }"
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
        class="button-reset h-4 mx-1"
        :title="`${status === 'LOCKED' ? 'Unlock' : 'Lock'} intensity`"
        @click.stop="lock"
      >
        <lock-icon class="fill-current text-gray-600" />
      </button>
      <check-icon
        v-if="status === 'LOCKED'"
        class="h-6 w-6 -mx-2 sm-fill-primary text-blue-500"
      />
    </div>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch } from '@vue/composition-api'

import EditIntensity from './EditIntensity.vue'
import FadeTransition from '../../components/FadeTransition'

import '../../components/MonoIcon.css'
import LockIcon from '../../assets/inline/refactoring-ui/lock.svg'
import CheckIcon from '../../assets/inline/refactoring-ui/check.svg'

import { IonImageIntensity } from './ionImageState'

interface Props {
  clippingType: string
  intensities: IonImageIntensity
  label: string
  placeholder: string
  tooltipDisabled: boolean
  value: number
}

export default defineComponent<Props>({
  props: {
    clippingType: String,
    intensities: Object,
    label: String,
    placeholder: String,
    tooltipDisabled: Boolean,
    value: Number,
  },
  components: {
    FadeTransition,
    EditIntensity,
    LockIcon,
    CheckIcon,
  },
  setup(props, { emit }) {
    const editing = ref(false)

    const status = computed(() => props.intensities.status)
    const display = computed(() => {
      if (status.value === 'LOCKED') {
        return props.intensities.user
      } else if (status.value === 'CLIPPED') {
        return props.intensities.clipped
      }
      return props.value
    })
    const intensity = computed(() => display.value.toExponential(1))
    const originalIntensity = computed(() => props.intensities.image.toExponential(1))

    return {
      editing,
      intensity,
      originalIntensity,
      status,
      submit(floatValue: number) {
        if (status.value === 'LOCKED') {
          emit('lock', floatValue)
        } else {
          emit('input', floatValue)
        }
        editing.value = false
      },
      reset() {
        emit('input', props.intensities.image)
        editing.value = false
      },
      lock() {
        emit('lock', status.value === 'LOCKED' ? undefined : display.value)
      },
    }
  },
})
</script>
<style scoped>
  button svg {
    height: 14px;
    width: 14px;
  }
  .sm-flex-direction:last-child {
    flex-direction: row-reverse;
  }

  .sm-fill-primary {
    fill: none;
  }
  .sm-fill-primary .primary {
    fill: currentColor;
  }
</style>
