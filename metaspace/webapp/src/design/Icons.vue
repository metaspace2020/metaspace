<template>
  <section>
    <form class="v-rhythm-3">
      <div>
        <h3 class="mb-3">
          Icon Style
        </h3>
        <div class="flex items-center">
          <el-select
            v-model="iconComponent"
            class="py-1"
            placeholder="Select Icon Type"
          >
            <el-option
              label="Stateful"
              value="stateful-icon"
            >
            </el-option>
            <el-option
              label="Primary"
              value="primary-icon"
            >
            </el-option>
            <el-option
              label="Secondary"
              value="secondary-icon"
            >
            </el-option>
          </el-select>
          <fade-transition class="ml-6 text-sm leading-5 text-gray-700">
            <p
              v-if="iconComponent === 'stateful-icon'"
              key="stateful"
            >
              Use for active/inactive states. Includes an optional "hover" state.
            </p>
            <p
              v-else-if="iconComponent === 'primary-icon'"
              key="primary"
            >
              Use for large icons that are intended to attract attention.
            </p>
            <p
              v-else-if="iconComponent === 'secondary-icon'"
              key="secondary"
            >
              Use for icons in a supporting role e.g. a button label.
              This style is intended for 'shape' icons, so the list is filtered to these.
            </p>
          </fade-transition>
        </div>
      </div>
      <div>
        <h3 class="mb-3">
          Icon Props
        </h3>
        <el-checkbox v-model="iconProps.inverse">
          Inverse
        </el-checkbox>
        <fade-transition>
          <span
            v-if="iconComponent === 'stateful-icon'"
            class="ml-8"
          >
            <el-checkbox v-model="iconProps.active">Active</el-checkbox>
            <el-checkbox
              v-model="iconProps.hover"
              :disabled="iconProps.active"
            >Hover</el-checkbox>
          </span>
        </fade-transition>
      </div>
    </form>
    <div class="grid grid-flow-row grid-cols-4 gap-6 mt-6">
      <div
        v-for="icon in icons"
        :key="icon"
        class="text-center"
      >
        <component
          :is="iconComponent"
          class="mx-auto mb-1 h-6 w-6"
          :active="iconProps.active"
          :hover="iconProps.hover"
          :inverse="iconProps.inverse"
        >
          <component :is="`${icon}-svg`" />
        </component>
        <p class="text-sm leading-6">
          {{ icon }}
        </p>
      </div>
    </div>
  </section>
</template>
<script lang="ts">
import { defineComponent, ref, computed, reactive } from '@vue/composition-api'

import StatefulIcon from '../components/StatefulIcon.vue'
import PrimaryIcon from '../components/PrimaryIcon.vue'
import SecondaryIcon from '../components/SecondaryIcon.vue'
import * as RefactoringUIIcons from './refactoringUIIcons'
import * as Form from '../components/Form'
import FadeTransition from '../components/FadeTransition'

const { default: iconConfig, ...svgComponents } = RefactoringUIIcons

export default defineComponent({
  components: {
    StatefulIcon,
    PrimaryIcon,
    SecondaryIcon,
    FadeTransition,
    ...svgComponents,
    ...Form,
  },
  setup() {
    const iconComponent = ref('stateful-icon')
    const icons = computed(() =>
      (iconComponent.value === 'secondary-icon'
        ? iconConfig.filter(_ => _.secondary)
        : iconConfig)
        .map(_ => _.name),
    )
    return {
      icons,
      iconComponent,
      iconProps: reactive({
        active: false,
        inverse: false,
        hover: false,
      }),
    }
  },
})
</script>
