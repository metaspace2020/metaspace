<template>
  <el-popover
    ref="popover"
    :hide-after="0"
    :show-after="0"
    trigger="hover"
    v-bind="$attrs"
  >
      <div class="leading-5 py-2 px-3 font-normal content text-sm text-left">
        <p v-if="filteredCompounds.length > 1" class="title">
          {{ filteredCompounds.length }} candidate molecules
        </p>
        <p v-if="filteredCompounds.length === 1" class="title">
          Candidate molecule
        </p>
        <ul class="p-0 list-none leading-7">
          <li v-for="(comp, i) in filteredCompounds" :key="i">
            {{ comp.name }}
          </li>
          <li v-if="moreCount" class="text-xs tracking-wide font-medium">
            + {{ moreCount }} more
          </li>
        </ul>
        <div v-if="showIsomers">
          <p class="title">
            <span v-if="isomers.length == 1">An isomeric ion was annotated</span>
            <span v-else>{{ isomers.length }} isomeric ions were annotated</span>
          </p>
          <p>
            Check the <b>Molecules</b> panel for more candidates.
          </p>
        </div>
        <div v-if="showIsobars">
          <p class="title">
            <span v-if="isobars.length == 1">An isobaric ion was annotated</span>
            <span v-else>{{ isobars.length }} isobaric ions were annotated</span>
          </p>
          <p class="max-w-measure-1">
            Check the <b>Molecules</b> panel to see candidate molecules from the isobaric {{ isobars.length == 1 ? 'ion' : 'ions' }},
            and the <b>Diagnostics</b> panel to compare the isotopic images and spectra.
          </p>
        </div>
      </div>
    <template #reference>
      <slot></slot>
    </template>
  </el-popover>
</template>

<script>
import { defineComponent, ref, computed } from 'vue'
import config from '../../../lib/config'

export default defineComponent({
  inheritAttrs: false,
  props: {
    possibleCompounds: { type: Array, required: true },
    limit: Number,
    isomers: Array,
    isobars: Array,
  },
  setup(props) {
    const popover = ref(null)

    const filteredCompounds = computed(() => {
      return props.limit != null
        ? props.possibleCompounds.slice(0, props.limit)
        : props.possibleCompounds
    })

    const moreCount = computed(() => {
      return props.possibleCompounds.length - filteredCompounds.value.length
    })

    const showIsomers = computed(() => {
      return config.features.isomers && props.isomers && props.isomers.length > 0
    })

    const showIsobars = computed(() => {
      return config.features.isobars && props.isobars && props.isobars.some(isobar => isobar.shouldWarn)
    })

    return {
      popover,
      filteredCompounds,
      moreCount,
      showIsomers,
      showIsobars,
    }
  },
})
</script>

<style lang="scss" scoped>
.content * {
  margin: 0;
}
.content > * + * {
  @apply mt-4;
}
.content > .title + * {
  @apply mt-2;
}
.title + * {
  @apply mt-1;
}
.title {
  @apply font-bold;
}
</style>
