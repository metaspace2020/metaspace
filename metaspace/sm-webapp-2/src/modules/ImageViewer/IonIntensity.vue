<template>
  <fade-transition>
    <edit-intensity
      v-if="editing"
      key="edit"
      class="w-20 sm-top-margin"
      :placeholder="placeholder"
      :initial-value="intensity"
      @submit="submit"
      @reset="reset"
      @close="editing = false"
    />
    <div
      v-else
      class="h-5 flex items-center sm-flex-direction"
      :class="{
          'flex-row-reverse': reverse ,
        }"
    >
      <button
        title="Click to edit"
        class="button-reset h-4 leading-5"
        :class="{
          'font-medium text-red-700': status === 'CLIPPED',
          'font-medium text-blue-700': status === 'LOCKED',
          'cursor-default': tooltipDisabled
        }"
        @mouseover="showPopover"
        @mouseleave="hidePopover"
        @focus="showPopover"
        @blur="hidePopover"
        @click.stop="editing = true; hidePopover()"
      >
        {{ intensity }}
      </button>
      <button
        class="button-reset h-4 mx-1"
        :title="`${status === 'LOCKED' ? 'Unlock' : 'Lock'} intensity`"
        @click.stop="lock"
      >
        <lock-icon class="fill-current text-gray-600" />
      </button>
      <el-icon
        v-if="status === 'LOCKED'"
        class="h-6 w-6 -mx-2 sm-fill-secondary text-blue-500 relative -z-10"
      ><Check />
      </el-icon>
    </div>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, computed, ref, defineAsyncComponent } from 'vue'

import EditIntensity from './EditIntensity.vue'
import FadeTransition from '../../components/FadeTransition'
import {ElIcon} from "element-plus";
import {Check} from "@element-plus/icons-vue";

import { IonImageIntensity } from './ionImageState'

const LockIcon = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-lock.svg')
);

interface Props {
  clippingType: string
  intensities: IonImageIntensity
  label: string
  placeholder: string
  tooltipDisabled: boolean
  value: number
}

export default defineComponent({
  props: {
    clippingType: String,
    intensities: Object,
    label: String,
    placeholder: String,
    tooltipDisabled: Boolean,
    reverse: Boolean,
    value: Number,
  },
  components: {
    FadeTransition,
    EditIntensity,
    LockIcon,
    ElIcon,
    Check,
  },
  setup(props: Props, { emit }) {
    const editing = ref(false)
    const status = computed(() => props.intensities.status)
    const intensity = computed(() => props.intensities.scaled.toExponential(1))

    return {
      editing,
      intensity,
      showPopover() {
        if (status.value === 'CLIPPED') {
          emit('show-popover')
        }
      },
      hidePopover() {
        emit('hide-popover')
      },
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
        emit('input', (props.intensities as any).image)
        editing.value = false
      },
      lock() {
        emit('lock', status.value === 'LOCKED' ? undefined : (props.intensities as any).scaled)
      },
    }
  },
})
</script>
<style scoped>
  .sm-top-margin {
    margin-top: 2px;
  }

  button svg {
    height: 14px;
    width: 14px;
  }
  /*.sm-flex-direction:last-child {*/
  /*  flex-direction: row-reverse;*/
  /*}*/

  .sm-fill-secondary {
    fill: none;
  }
  .sm-fill-secondary .secondary {
    fill: currentColor;
  }
</style>
