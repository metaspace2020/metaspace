<template>
  <tag-filter
    :name="name"
    :removable="removable"
    :width="256"
    @show="show"
    @destroy="destroy"
  >
    <div slot="edit">
      <el-input-number
        ref="input"
        v-model="localValue"
        :step="0.0001"
        maxlength="10"
        class="w-full"
        controls-position="right"
        @change="onChange"
      />
      <FilterHelpText>
        Press <span class="font-medium">Enter</span> to confirm manual input
      </FilterHelpText>
    </div>
    <span slot="show">
      <span
        v-if="value"
        class="tf-value-span"
      >
        {{ value }}
      </span>
      <span
        v-else
        class="inline-block w-4 tf-value-span"
      />
      <span class="ml-1">
        ± {{ precision }}
      </span>
    </span>
  </tag-filter>
</template>

<script>
import Vue, { ComponentOptions } from 'vue'
import { mzFilterPrecision } from '../../../lib/util'
import TagFilter from './TagFilter.vue'
import { FilterHelpText } from './TagFilterComponents'

export default Vue.extend({
  name: 'MzFilter',
  components: {
    TagFilter,
    FilterHelpText,
  },
  props: {
    name: String,
    value: [String, Number], // string if from query string, number if edited
    removable: { type: Boolean, default: true },
  },
  data(vm) {
    return {
      localValue: Number(vm.value) || 0,
    }
  },
  computed: {
    precision() {
      return mzFilterPrecision(this.value)
    },
  },
  watch: {
    value: function() {
      this.localValue = Number(this.value) || 0
    },
  },
  methods: {
    onChange(val) {
      /* sending undefined causes an issue */
      const v = val === undefined ? 0 : val
      this.$emit('input', v)
      this.$emit('change', v)
    },
    destroy() {
      this.$emit('destroy', this.name)
    },
    show() {
      if (this.$refs.input) {
        const componentInstance = this.$refs.input
        const input = componentInstance.$refs.input
        input.focus()
      }
    },
  },
})
</script>
