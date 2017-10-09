<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

    <tf-input-box :mode="mode" @change="onChange" :value="value">
    </tf-input-box>

    <div class="tf-remove el-icon-circle-close"
         v-if="removable"
         @click="destroy"></div>
  </div>
</template>

<script lang="ts">
 import TagFilterInputBox from './TagFilterInputBox.vue';
 import Vue, { ComponentOptions } from 'vue';

 interface InputFilter extends Vue {
   name: string
   value: string | number
   removable: boolean
   mode: string

   onChange(val: string | number): void
   destroy(): void
 }

 export default {
   name: 'input-filter',
   components: {
     'tf-input-box': TagFilterInputBox
   },
   props: {
     name: String,
     value: [String, Number],
     removable: {type: Boolean, default: true},
     mode: {type: String, default: 'text'}
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
 } as ComponentOptions<InputFilter>;
</script>
