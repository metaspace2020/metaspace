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
      v-model="value"
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

<script lang="ts">
import TagFilter from './TagFilter.vue'
import Vue from 'vue'
import { debounce } from 'lodash-es'
import { ElInput } from 'element-ui/types/input'

interface InputFilter extends Vue {
   name: string
   value: string | number
   removable: boolean
   mode: string

   onChange(val: string | number): void
   destroy(): void
   show(): void
}

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
  data: function() {
    return {

    }
  },
  created() {
    if (this.debounce) {
      this.onChange = debounce(this.onChange, 500)
    }
  },
  methods: {
    onChange(val: any) {
      this.$emit('input', val)
      this.$emit('change', val)
    },
    destroy() {
      this.$emit('destroy', this.name)
    },
    show() {
      if (this.$refs.input) {
        const componentInstance = (this.$refs.input as ElInput)
        const input = (componentInstance.$refs.input as HTMLInputElement)
        input.focus()
      }
    },
  },
})
</script>
