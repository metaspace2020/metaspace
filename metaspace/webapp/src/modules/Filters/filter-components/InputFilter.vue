<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

    <tf-input-box
      :mode="mode"
      :value="value"
      @change="onChange"
    />

    <div
      v-if="removable"
      class="tf-remove el-icon-error"
      @click="destroy"
    />
  </div>
</template>

<script lang="ts">
import TagFilterInputBox from './TagFilterInputBox.vue'
import Vue from 'vue'
import { debounce } from 'lodash-es'

 interface InputFilter extends Vue {
   name: string
   value: string | number
   removable: boolean
   mode: string

   onChange(val: string | number): void
   destroy(): void
 }

export default Vue.extend({
  name: 'InputFilter',
  components: {
    'tf-input-box': TagFilterInputBox,
  },
  props: {
    name: String,
    value: [String, Number],
    removable: { type: Boolean, default: true },
    mode: { type: String, default: 'text' },
    debounce: Boolean,
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
  },
})
</script>
