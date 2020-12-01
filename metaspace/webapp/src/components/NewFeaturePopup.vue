<template>
  <span>
    <div
      v-if="isRelevant"
      v-show="isActive"
      ref="popover"
      class="el-popover el-popper leading-5 p-5 text-left"
    >
      <h3 class="leading-10 m-0 mt-2">
        <el-badge
          value="New"
          class="test"
        >
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
    <span
      ref="reference"
      :class="referenceClass"
    >
      <slot name="reference" />
    </span>
  </span>
</template>
<script lang="ts">
import { defineComponent, computed, ref, onMounted, onBeforeUnmount, watch, onUnmounted } from '@vue/composition-api'
import Popper, { Placement } from 'popper.js'

import useNewFeaturePopups from './useNewFeaturePopups'
import config from '../lib/config'

interface Props {
  name: string
  title: string
  placement: Placement
  showUntil: Date
  referenceClass: string
}

export default defineComponent<Props>({
  props: {
    name: String,
    title: String,
    placement: String,
    showUntil: Date,
    referenceClass: String,
  },
  setup(props, { root }) {
    const { activePopup, queuePopup, remindLater, dismissPopup } = useNewFeaturePopups()

    const popover = ref<HTMLElement>()
    const reference = ref<HTMLElement>()

    const isRelevant = (props.showUntil || Number.MAX_VALUE) > new Date()

    if (isRelevant) {
      queuePopup(props.name)
    }

    const isActive = computed(() =>
      popover.value
      && reference.value
      && config.features.new_feature_popups
      && root.$store.state.currentTour === null
      && activePopup.value === props.name,
    )

    let popper : Popper | null

    watch(isActive, value => {
      if (value === true) {
        popper = new Popper(reference.value!, popover.value!, { placement: props.placement })
      } else if (popper) {
        popper.destroy()
        popper = null
      }
    })

    onBeforeUnmount(() => {
      if (popper) {
        popper.destroy()
      }
    })

    return {
      popover,
      reference,
      isRelevant,
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
