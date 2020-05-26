<template>
  <div>
    <div
      v-if="tour"
      ref="container"
      class="ts-container bg-white shadow-md text-inherit text-sm leading-5 p-4 rounded w-full box-border max-w-md border-solid border-gray-100"
    >
      <div class="bubble-container">
        <div class="h-5 pb-1 pr-8">
          <el-progress
            :percentage="100 * (stepNum + 1) / tour.steps.length"
            :stroke-width="10"
            :show-text="false"
          />
        </div>

        <div class="bubble-content">
          <h3
            v-if="step.title !== ''"
            class="ts-title"
          >
            {{ step.title }}
          </h3>
          <div
            v-if="step.content !== ''"
            class="ts-content"
            v-html="step.content"
          />
        </div>

        <div class="ts-actions">
          <el-button
            v-if="stepNum > 0"
            :key="step.title"
            size="small"
            @click.native="prevStep"
          >
            Back
          </el-button>

          <el-button
            :key="step.title"
            size="small"
            type="primary"
            @click.native="nextStep"
          >
            {{ stepNum == tour.steps.length - 1 ? 'Done' : 'Next' }}
          </el-button>
        </div>

        <button
          class="button-reset ts-close"
          title="Exit tour"
          @click="close"
        >
          &#128473;
          <!-- <i
            class="el-icon-close"
          /> -->
        </button>
      </div>

      <div
        class="popper__arrow"
        x-arrow=""
      />
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Popper from 'popper.js'

import router from '../../router'

const startingRoute = 'help'

export default {
  name: 'TourStep',
  props: ['tour'],
  data() {
    return {
      lastRoute: startingRoute,
      stepNum: 0,
      popper: null,
      container: null,
      routeTransition: false,
    }
  },
  computed: {
    step() {
      if (!this.tour) {
        return null
      }
      return this.tour.steps[this.stepNum]
    },
  },
  created() {
    router.beforeEach((to, from, next) => {
      if (!this.tour || to.path === from.path) {
        next()
        return
      }

      if (this.routeTransition) {
        this.routeTransition = false
        next()
      } else {
        this.close()
        next()
      }
    })
  },
  mounted() {
    if (this.tour) {
      this.render()
    }
  },
  updated() {
    if (this.tour) {
      this.render()
    }
  },
  methods: {
    nextStep() {
      this.stepNum += 1
      if (this.tour.steps.length === this.stepNum) {
        this.close()
        return
      }

      this.popper.destroy()
      this.render()
    },

    prevStep() {
      if (this.stepNum === 0) {
        return
      } // shouldn't happen
      this.stepNum -= 1
      this.popper.destroy()
      this.render()
    },

    render() {
      // FIXME: simplify the logic here and make it more universal
      if (this.step.route && this.lastRoute !== this.step.route) {
        this.lastRoute = this.step.route
        this.routeTransition = true
        if (this.step.query) {
          router.push({ path: this.lastRoute, query: this.step.query })
        } else {
          router.push({ path: this.lastRoute })
        }
      } else if (this.step.query) {
        router.replace({ query: this.step.query })
      }

      const minTimeout = 20 /* ms */
      const maxTimeout = 2000
      const factor = 2

      const self = this
      let timeout = minTimeout

      function showStep() {
        if (self.step != null) {
          const el = document.querySelector(self.step.target)
          if (!el) {
            timeout *= factor
            if (timeout > maxTimeout) {
              return
            }
            window.setTimeout(showStep, timeout)
            return
          }

          self.popper = new Popper(el, self.$refs.container, { placement: self.step.placement })
        }
      }

      Vue.nextTick(() => {
        window.setTimeout(showStep, timeout)
      })
    },

    close() {
      if (this.popper) {
        this.popper.destroy()
      }
      this.stepNum = 0
      this.lastRoute = startingRoute
      this.routeTransition = false
      this.$store.commit('endTour')
    },
  },
}
</script>

<style lang="scss">

  .ts-actions {
    @apply h-10 mt-5 flex justify-end items-center;
  }

  $popper-arrow-color: theme('colors.gray.300');
  $popper-arrow-size: 6px;
  $border-width: 1px;

 .ts-container {
    z-index: 10100;
    border-width: $border-width;

    .ts-close {
      @apply h-6 w-6 p-1 leading-none flex items-center justify-center rounded-full text-gray-700;
      position: absolute;
      top: 9px; // hard coded to center it against progress bar
      right: 12px;
      background: transparent;
      border: none;
      font-size: 14px;

      &:active,
      &:focus {
        outline: none;
      }

      &:hover,
      &:focus {
        @apply bg-blue-100 text-blue-800;
      }
    }

   .popper__arrow {
     width: 0;
     height: 0;
     border-style: solid;
     position: absolute;
     margin: $popper-arrow-size;
   }

   &[x-placement^="top"] {
     margin-bottom: $popper-arrow-size;

     .popper__arrow {
       border-width: $popper-arrow-size $popper-arrow-size 0 $popper-arrow-size;
       border-color: $popper-arrow-color transparent transparent transparent;
       bottom: -$popper-arrow-size - $border-width;
       left: calc(50% - $popper-arrow-size);
       margin-top: 0;
       margin-bottom: 0;
     }
   }

   &[x-placement^="bottom"] {
     margin-top: $popper-arrow-size;

     .popper__arrow {
       border-width: 0 $popper-arrow-size $popper-arrow-size $popper-arrow-size;
       border-color: transparent transparent $popper-arrow-color transparent;
       top: -$popper-arrow-size - $border-width;
       left: calc(50% - $popper-arrow-size);
       margin-top: 0;
       margin-bottom: 0;
     }
   }

   &[x-placement^="right"] {
     margin-left: $popper-arrow-size;

     .popper__arrow {
       border-width: $popper-arrow-size $popper-arrow-size $popper-arrow-size 0;
       border-color: transparent $popper-arrow-color transparent transparent;
       left: -$popper-arrow-size - $border-width;
       top: calc(50% - $popper-arrow-size);
       margin-left: 0;
       margin-right: 0;
     }
   }

   &[x-placement^="left"] {
     margin-right: $popper-arrow-size;

     .popper__arrow {
       border-width: $popper-arrow-size 0 $popper-arrow-size $popper-arrow-size;
       border-color: transparent transparent transparent $popper-arrow-color;
       right: -$popper-arrow-size - $border-width;
       top: calc(50% - $popper-arrow-size);
       margin-left: 0;
       margin-right: 0;
     }
   }

    .ts-title {
      @apply leading-10 m-0;
    }

    .ts-content {
      > * {
        margin: 0;
      }
      > * + * {
        @apply mt-5;
      }
      ul {
        @apply pl-4;
      }
    }
 }
</style>
