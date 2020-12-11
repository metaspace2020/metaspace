<template>
  <div
    v-if="isActive"
    ref="popover"
    class="el-popover el-popper leading-5 p-5 text-left"
  >
    <h3 class="leading-10 m-0 mt-2">
      <el-badge value="New">
        {{ title }}
      </el-badge>
    </h3>
    <div class="sm-content font-normal">
      <slot name="default" />
    </div>
    <div class="flex justify-end items-center h-10 mt-5">
      <el-button
        size="small"
        @click.stop="remindLater"
      >
        Remind me later
      </el-button>
      <el-button
        size="small"
        type="primary"
        @click.stop="dismissPopup"
      >
        Got it!
      </el-button>
    </div>
    <div
      class="popper__arrow"
      x-arrow=""
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref, onMounted, onBeforeUnmount, watch, onUnmounted } from '@vue/composition-api'

import useNewFeaturePopups from './useNewFeaturePopups'

interface Props {
  featureKey: string
  title: string
}

export default defineComponent<Props>({
  props: {
    featureKey: { type: String },
    title: String,
  },
  setup(props, { root }) {
    const {
      activePopup,
      popoverRef,
      dismissPopup,
      remindLater,
    } = useNewFeaturePopups()

    const isActive = computed(() => activePopup.value === props.featureKey)

    return {
      popover: popoverRef,
      isActive,
      remindLater,
      dismissPopup,
    }
  },
})
</script>
<style scoped>
  .el-popover {
    width: theme('maxWidth.sm')
  }

  /deep/ .sm-content > * {
    margin: 0;
  }
  /deep/ .sm-content > * + * {
    @apply mt-5;
  }
</style>
