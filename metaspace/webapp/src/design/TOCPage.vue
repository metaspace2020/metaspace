<template>
  <content-page>
    <h1>Design Documentation</h1>
    <div class="grid grid-cols-2 grid-flow-row gap-12 pt-12">
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon class="block mb-3" inverse>
            <compass-svg />
          </primary-icon>
          <router-link to="design/styleguide"> Style guide </router-link>
        </h2>
        <p>fonts, text styles, colours, and utilities</p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon class="block mb-3">
            <launch-svg />
          </primary-icon>
          <router-link to="design/icons"> Icons </router-link>
        </h2>
        <p>with dynamic props</p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon class="block mb-3">
            <brick-svg />
          </primary-icon>
          <router-link to="design/components"> Components </router-link>
        </h2>
        <p>reinvent the wheel, only once</p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon class="block mb-3">
            <survey-svg />
          </primary-icon>
          <router-link to="design/forms"> Forms </router-link>
        </h2>
        <p>get in formation</p>
      </article>
    </div>
  </content-page>
</template>
<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue'

import ContentPage from '../components/ContentPage.vue'
import PrimaryIcon from '../components/PrimaryIcon.vue'

const CompassSvg = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-compass.svg'))
const LaunchSvg = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-launch.svg'))
const BrickSvg = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-brick.svg'))
const SurveySvg = defineAsyncComponent(() => import('../assets/inline/refactoring-ui/icon-survey.svg'))

export default defineComponent({
  components: {
    ContentPage,
    PrimaryIcon,
    CompassSvg,
    LaunchSvg,
    BrickSvg,
    SurveySvg,
  },
})
</script>
