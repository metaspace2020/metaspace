<template>
  <div class="tf-value">
    <span class="tf-value-span"
          @click="enterEditMode"
          v-if="!editMode">
      <span v-if="value">
        {{ value }}
      </span>
      <span style="display:inline-block; width: 15px;" v-else>
      </span>
    </span>

    <span class="tf-value-edit"
          v-on-clickaway="quitEditMode"
          v-if="editMode">
      <input ref="input" v-if="mode == 'number'"
             class="tf-value-input" type="number" step="0.0001"
             maxlength="10" :value="value" @input="onChange($event.target.value)">

      <input ref="input" v-else
             class="tf-value-input" type="text"
             :value="value" @input="onChange($event.target.value)">
    </span>
  </div>
</template>

<script>
 import { mixin as clickaway } from 'vue-clickaway';
 import Vue from 'vue';

 export default {
   name: 'tf-input-box',
   mixins: [clickaway],
   props: {
     value: [String, Number],
     mode: String
   },
   data() {
     return {
       editMode: false
     };
   },
   methods: {
     onChange(val) {
       this.$emit('change', val);
     },
     enterEditMode() {
       this.editMode = true;
       Vue.nextTick(() => {
         this.$refs.input.select();
       });
     },
     quitEditMode() { this.editMode = false; }
   }
 }

</script>

<style>
 .tf-value-input {
   display: inline-flex;
 }
</style>
