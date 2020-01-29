<template>
  <div
    v-if="!editMode"
    class="tf-value"
    @click="enterEditMode"
  >
    <span class="tf-value-span">
      <span v-if="value">
        {{ value }}
      </span>
      <span
        v-else
        style="display:inline-block; width: 15px;"
      />
    </span>
  </div>
  <input
    v-else-if="mode === 'number'"
    ref="input"
    v-on-clickaway="quitEditMode"
    class="tf-value tf-value-input"
    type="number"
    step="0.0001"
    maxlength="10"
    :value="value"
    @input="onChange($event.target.value)"
  >

  <input
    v-else
    ref="input"
    v-on-clickaway="quitEditMode"
    class="tf-value tf-value-input"
    type="text"
    :value="value"
    @input="onChange($event.target.value)"
  >
</template>

<script>
import { mixin as clickaway } from 'vue-clickaway'
import Vue from 'vue'

export default {
  name: 'TfInputBox',
  mixins: [clickaway],
  props: {
    value: [String, Number],
    mode: String,
  },
  data() {
    return {
      editMode: false,
    }
  },
  methods: {
    onChange(val) {
      this.$emit('change', val)
    },
    enterEditMode() {
      this.editMode = true
      Vue.nextTick(() => {
        this.$refs.input.select()
      })
    },
    quitEditMode() { this.editMode = false },
  },
}

</script>
