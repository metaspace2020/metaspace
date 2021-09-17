<template>
  <overlay class="overflow-x-hidden overflow-y-auto px-0 sm-menu-items">
    <ion-image-menu-item
      v-for="item in menuItems"
      :key="item.id"
      :item="item"
      :is-active="activeLayer === item.id"
      :is-normalized="isNormalized"
      :popups-disabled="popupsDisabled"
      @active="setActiveLayer"
      @remove="removeLayer"
      @slider-start="popupsDisabled = true"
      @slider-stop="popupsDisabled = false"
    />
    <!-- margin removed below for Safari -->
    <button
      class="button-reset p-3 h-12 w-full cursor-default text-gray-700 text-center m-0"
      :class="{ 'bg-blue-100 text-primary': activeLayer === null }"
      @click="() => setActiveLayer(null)"
    >
      <fade-transition class="text-xs tracking-wide font-medium text-inherit">
        <span
          v-if="activeLayer === null"
          key="active"
        >
          Select annotation
        </span>
        <span
          v-else
          key="inactive"
          class="flex items-center justify-center"
        >
          Add ion image
        </span>
      </fade-transition>
    </button>
  </overlay>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import IonImageMenuItem from './IonImageMenuItem.vue'
import FadeTransition from '../../components/FadeTransition'

import { useIonImageMenu } from './ionImageState'

export default defineComponent({
  props: {
    menuItems: Array,
    isNormalized: Boolean,
  },
  components: {
    IonImageMenuItem,
    Overlay,
    FadeTransition,
  },
  setup(props, { emit }) {
    const { activeLayer, removeLayer, setActiveLayer } = useIonImageMenu()

    const popupsDisabled = ref(false)

    return {
      popupsDisabled,
      activeLayer,
      removeLayer,
      setActiveLayer,
    }
  },
})
</script>
<style scoped>
.sm-menu-items >>> > * {
  @apply box-border border-0 border-t border-solid border-gray-200;
}
.sm-menu-items >>> > *:last-child {
  @apply border-b;
}
.sm-menu-items >>> > .focus-visible {
  outline: 2px solid theme('colors.primary');
  outline-offset: -2px;
}
.sm-menu-items >>> > *:hover {
  outline: 1px solid theme('colors.primary');
  outline-offset: -1px;
}
</style>
