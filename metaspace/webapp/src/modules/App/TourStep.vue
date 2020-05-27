<template>
  <div>
    <div
      v-if="tour"
      ref="container"
      class="el-popover el-popper el-popover--plain max-w-sm leading-5 p-5 text-left relative"
    >
      <div class="h-5 pr-8 flex items-center">
        <el-progress
          class="w-full"
          :percentage="100 * (stepNum + 1) / tour.steps.length"
          :stroke-width="10"
          :show-text="false"
        />
      </div>

      <h3
        v-if="step.title !== ''"
        class="leading-10 m-0 mt-5"
      >
        {{ step.title }}
      </h3>
      <div
        v-if="step.content !== ''"
        class="ts-content"
        v-html="step.content"
      />
      <div class="h-10 mt-5 flex justify-end items-center">
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
      </button>
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

<style lang="scss" scoped>
  .el-popover {
    z-index: 2002; // should appear above header
  }

  /deep/ .ts-close {
    @apply h-6 w-6 p-1 leading-none flex items-center justify-center rounded-full text-gray-700;
    position: absolute;

    // hard coded to center it against progress bar
    top: 18px;
    right: 14px;

    &:active,
    &:focus {
      outline: none;
    }

    &:hover,
    &:focus {
      @apply bg-blue-100 text-blue-800;
    }
  }

  /deep/ .ts-content {
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
</style>
