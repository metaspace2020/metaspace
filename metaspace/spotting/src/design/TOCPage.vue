<template>
  <content-page>
    <h1>Design Documentation</h1>
    <div class="grid grid-cols-2 grid-flow-row gap-12 pt-12">
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon
            class="block mb-3"
            inverse
          >
            <compass-svg />
          </primary-icon>
          <router-link to="design/styleguide">
            Style guide
          </router-link>
        </h2>
        <p>
          fonts, text styles, colours, and utilities
        </p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon
            class="block mb-3"
          >
            <launch-svg />
          </primary-icon>
          <router-link to="design/icons">
            Icons
          </router-link>
        </h2>
        <p>
          with dynamic props
        </p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon
            class="block mb-3"
          >
            <brick-svg />
          </primary-icon>
          <router-link to="design/components">
            Components
          </router-link>
        </h2>
        <p>
          reinvent the wheel, only once
        </p>
      </article>
      <article>
        <h2 class="text-2xl leading-snug font-display m-0">
          <primary-icon
            class="block mb-3"
          >
            <survey-svg />
          </primary-icon>
          <router-link to="design/forms">
            Forms
          </router-link>
        </h2>
        <p>
          get in formation
        </p>
      </article>
    </div>
  </content-page>
</template>
<script lang="ts">
import Vue from 'vue'

import ContentPage from '../components/ContentPage.vue'
import PrimaryIcon from '../components/PrimaryIcon.vue'

import CompassSvg from '../assets/inline/refactoring-ui/icon-compass.svg'
import LaunchSvg from '../assets/inline/refactoring-ui/icon-launch.svg'
import BrickSvg from '../assets/inline/refactoring-ui/icon-brick.svg'
import SurveySvg from '../assets/inline/refactoring-ui/icon-survey.svg'

export default Vue.extend({
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
