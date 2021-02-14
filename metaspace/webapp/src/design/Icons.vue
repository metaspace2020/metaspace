<template>
  <section class="grid grid-flow-row grid-cols-4 gap-6">
    <div
      v-for="icon in icons"
      :key="icon"
      class="text-center"
    >
      <component
        :is="'stateful-icon'"
        class="mx-auto mb-1 h-6 w-6"
        hover
      >
        <component :is="`${icon}-svg`" />
      </component>
      <p class="text-sm leading-6">
        {{ icon }}
      </p>
    </div>
  </section>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import StatefulIcon from '../components/StatefulIcon.vue'
import PrimaryIcon from '../components/PrimaryIcon.vue'
import SecondaryIcon from '../components/SecondaryIcon.vue'
import * as RefactoringUIIcons from './refactoringUIIcons'

const { default: icons, ...svgComponents } = RefactoringUIIcons

export default defineComponent({
  components: {
    StatefulIcon,
    PrimaryIcon,
    SecondaryIcon,
    ...svgComponents,
  },
  setup() {
    return {
      icons,
    }
  },
})
</script>
