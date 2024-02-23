<template>
  <span ref="reference" v-bind="$attrs">
    <slot />
  </span>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch, onUnmounted } from 'vue'
import Popper, { Placement } from 'popper.js'

import useNewFeaturePopups from './useNewFeaturePopups'
import config from '../../lib/config'
import useIntersectionObserver from '../../lib/useIntersectionObserver'
import { useStore } from 'vuex'

interface Props {
  featureKey: string
  placement: Placement
  showUntil: Date
}

export default defineComponent({
  props: {
    featureKey: String,
    placement: String,
    showUntil: Date,
  },
  setup(props: Props | any) {
    const store = useStore()
    const { activePopup, isDismissed, queuePopup, unqueuePopup, popoverRef } = useNewFeaturePopups()

    const reference = ref<HTMLElement>()

    const isRelevant = (props.showUntil || Number.MAX_VALUE) > new Date()

    if (!isRelevant || isDismissed(props.featureKey)) {
      return {}
    }

    const { isFullyInView } = useIntersectionObserver(reference, { threshold: [0, 1] })

    watch(isFullyInView, (value) => {
      if (value) {
        queuePopup(props.featureKey)
      } else if (activePopup.value !== props.featureKey) {
        // do not unqueue if popup is visible
        unqueuePopup(props.featureKey)
      }
    })

    const isActive = computed(() => {
      return (
        reference.value &&
        popoverRef.value &&
        config.features.new_feature_popups &&
        store.state.currentTour === null &&
        activePopup.value === props.featureKey
      )
    })

    let popper: Popper | null

    watch(isActive, (value) => {
      if (value === true) {
        popper = new Popper(reference.value!, popoverRef.value!, {
          placement: props.placement,
          modifiers: {
            preventOverflow: {
              boundariesElement: 'viewport',
            },
          },
        })
      } else if (popper) {
        popper.destroy()
        popper = null
      }
    })

    onUnmounted(() => {
      if (popper) {
        popper.destroy()
      }
      // in case popup was not dismissed
      unqueuePopup(props.featureKey)
    })

    return {
      reference,
    }
  },
})
</script>
