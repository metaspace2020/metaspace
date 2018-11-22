<template>
  <div v-if="!editMode" class="tf-value" @click="enterEditMode">
    <span class="tf-value-span">
      <span v-if="value">
        {{ value }}
      </span>
      <span style="display:inline-block; width: 15px;" v-else>
      </span>
    </span>
  </div>
  <input v-else-if="mode === 'number'" v-on-clickaway="quitEditMode" ref="input"
         class="tf-value tf-value-input" type="number" step="0.0001"
         maxlength="10" :value="value" @input="onChange($event.target.value)">

  <input v-else v-on-clickaway="quitEditMode" ref="input"
         class="tf-value tf-value-input" type="text"
         :value="value" @input="onChange($event.target.value)">
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

<style lang="scss">
 .tf-value-input input, input.tf-value-input {
   border: none;
   // This takes styles from "html" and "#app" in App.vue to make the text match the other filters
   font-family: 'Roboto', Helvetica, sans-serif;
   font-size: 1em;
   -webkit-font-smoothing: antialiased;
   -moz-osx-font-smoothing: grayscale;
   color: #2c3e50;

   &::-ms-clear {
     display: none;
   }
 }
</style>
