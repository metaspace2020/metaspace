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

 interface MzFilter extends Vue {
   name: string
   value: number
   removable: boolean
   onChange(val: number): void
   destroy(): void
 }

 export default {
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
     precision() {
       return mzFilterPrecision(this.value);
     }
   },
   methods: {
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy() {
       this.$emit('destroy', this.name);
     }
   }
 } as ComponentOptions<MzFilter>
</script>
