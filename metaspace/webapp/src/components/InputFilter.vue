<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

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
        <el-input ref="input" :value="value" @change="onChange" size="small"></input>
      </span>
    </div>

    <div class="tf-remove el-icon-circle-close"
         v-if="removable"
         @click="destroy"></div>
  </div>
</template>

<script>
 import { mixin as clickaway } from 'vue-clickaway';
 import TagFilter from './TagFilter.vue';

 export default {
   name: 'input-filter',
   mixins: [clickaway],
   components: {
     TagFilter
   },
   props: {
     name: String,
     options: Object,
     value: [String, Number],
     removable: {type: Boolean, default: true}
   },
   data() {
     return {
       editMode: false
     };
   },
   methods: {
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy() {
       this.$emit('destroy', this.name);
     },
     enterEditMode() {
       this.editMode = true;
       Vue.nextTick(() => {
         // FIXME: use of ElementUI internals
         this.$refs.input.$refs.input.focus();
       });
     },
     quitEditMode() { this.editMode = false; }
   }
 }
</script>

<style>
 .tf-value-edit > .el-input {
   display: inline-flex;
 }
</style>
