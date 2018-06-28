<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

    <tf-input-box mode="number" @change="onChange" :value="value">
    </tf-input-box>

    <span>± {{ precision }}</span>

    <div class="tf-remove el-icon-circle-close"
         v-if="removable"
         @click="destroy"></div>
  </div>
</template>

<script lang="ts">
 import Vue, { ComponentOptions } from 'vue'
 import TagFilterInputBox from './TagFilterInputBox.vue';
 import {mzFilterPrecision} from '../util';

 export default Vue.extend({
   name: 'mz-filter',
   components: {
     'tf-input-box': TagFilterInputBox
   },
   props: {
     name: String,
     value: Number,
     removable: {type: Boolean, default: true}
   },
   computed: {
     precision(): string {
       return mzFilterPrecision(this.value);
     }
   },
   methods: {
     onChange(val: number): void {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy(): void {
       this.$emit('destroy', this.name);
     }
   }
 })
</script>
