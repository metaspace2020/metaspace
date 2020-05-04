<template>
  <tag-filter
    :name="name"
    :removable="removable"
    @show="show"
    @destroy="destroy"
  >
    <el-input
      ref="input"
      slot="edit"
      v-model="localValue"
      type="text"
      @input="onChange"
    />
    <span
      slot="show"
      class="tf-value-span"
    >
      <span v-if="value">
        {{ value }}
      </span>
      <span
        v-else
        class="inline-block w-4"
      />
    </span>
  </tag-filter>
</template>

<script>
import { debounce } from 'lodash-es'
import TagFilter from './TagFilter.vue'
import Vue from 'vue'

export default Vue.extend({
  name: 'InputFilter',
  components: {
    TagFilter,
  },
  props: {
    name: String,
    value: [String, Number],
    removable: { type: Boolean, default: true },
    mode: { type: String, default: 'text' },
    debounce: Boolean,
  },
  data(vm) {
    return {
      localValue: vm.value,
    }
  },
  watch: {
    value: function() {
      this.localValue = this.value
    },
  },
  created() {
    if (this.debounce) {
      this.onChange = debounce(this.onChange, 500)
    }
  },
  methods: {
    onChange(val) {
      this.$emit('input', val)
      this.$emit('change', val)
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
