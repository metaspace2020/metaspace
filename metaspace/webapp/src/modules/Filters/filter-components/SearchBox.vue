<template>
  <div class="tf-outer border-gray-300 border border-solid text-sm">
    <div class="tf-name bg-gray-100 text-gray-600 tracking-tight px-3 border-0 border-r border-solid border-gray-300">
      <i
        class="el-icon-search"
      />
    </div>

    <input
      ref="input"
      class="tf-value tf-value-input px-3"
      type="text"
      placeholder="Enter keywords"
      :value="value"
      @input="onChange($event.target.value)"
    >

    <div
      v-if="removable"
      class="tf-remove el-icon-error"
      @click="destroy"
    />
  </div>
</template>

<script lang="ts">
import Vue, { ComponentOptions } from 'vue'

 interface SearchBox extends Vue {
   name: string
   value: string
   removable: boolean
   onChange(val: string): void
   destroy(): void
 }

export default {
  name: 'search-box',
  props: {
    value: String,
    removable: { type: Boolean, default: true },
  },
  methods: {
    onChange(val) {
      this.$emit('input', val)
      this.$emit('change', val)
    },
    destroy() {
      this.$emit('destroy', this.name)
    },
  },
} as ComponentOptions<SearchBox>
</script>
