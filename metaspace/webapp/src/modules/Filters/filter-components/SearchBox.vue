<template>
  <div class="tf-outer">
    <div class="tf-name">
      <i
        class="el-icon-search"
        style="color: white"
      />
    </div>

    <input
      ref="input"
      class="tf-value tf-value-input"
      type="text"
      placeholder="enter any keywords"
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
