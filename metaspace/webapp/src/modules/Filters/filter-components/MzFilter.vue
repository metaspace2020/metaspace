<template>
  <tag-filter
    :name="name"
    :removable="removable"
    :width="200"
    @show="show"
    @destroy="destroy"
  >
    <!-- v-model="value" -->
    <div slot="edit">
      <el-input-number
        ref="input"
        v-model="value"
        :step="0.0001"
        maxlength="10"
        style="width: 100%"
        controls-position="right"
        @input="onChange"
      />
      <p class="m-0 mt-2 leading-none text-xs">
        <em>Press enter to input value</em>
      </p>
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

<script lang="ts">
import Vue, { ComponentOptions } from 'vue'
import { mzFilterPrecision } from '../../../lib/util'
import TagFilter from './TagFilter.vue'
import { ElInputNumber } from 'element-ui/types/input-number'

export default Vue.extend({
  name: 'MzFilter',
  components: {
    TagFilter,
  },
  props: {
    name: String,
    value: Number,
    removable: { type: Boolean, default: true },
  },
  computed: {
    precision(): string {
      return mzFilterPrecision(this.value)
    },
  },
  methods: {
    onChange(val: number): void {
      /* undefined causes a crash */
      const v = val === undefined ? 0 : val
      this.$emit('input', v)
      this.$emit('change', v)
    },
    destroy(): void {
      this.$emit('destroy', this.name)
    },
    show() {
      if (this.$refs.input) {
        const componentInstance = (this.$refs.input as ElInputNumber)
        const input = (componentInstance.$refs.input as HTMLInputElement)
        input.focus()
      }
    },
  },
})
</script>
