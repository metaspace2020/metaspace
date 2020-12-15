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
        :step="step"
        :max="max"
        :min="min"
        class="w-full"
        controls-position="right"
        @change="onChange"
      />
      <filter-help-text>
        Press <span class="font-medium">Enter</span> to confirm manual input
      </filter-help-text>
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
      <slot name="default" />
    </span>
  </tag-filter>
</template>

<script>
import Vue, { ComponentOptions } from 'vue'
import TagFilter from './TagFilter.vue'
import { FilterHelpText } from './TagFilterComponents'

export default Vue.extend({
  name: 'NumberFilter',
  components: {
    TagFilter,
    FilterHelpText,
  },
  props: {
    name: String,
    value: [String, Number], // string if from query string, number if edited
    removable: { type: Boolean, default: true },
    min: Number,
    max: Number,
    maxlength: String,
    step: Number,
  },
  data(vm) {
    return {
      localValue: Number(vm.value) || 0,
    }
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
