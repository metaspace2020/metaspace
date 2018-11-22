<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

    <el-popover trigger="click"
                placement="bottom"
                :width="width"
                class="tf-value-container">
      <slot name="edit"></slot>
      <div class="tf-value" slot="reference">
        <slot name="show"></slot>
      </div>
    </el-popover>

    <div class="tf-remove el-icon-circle-close"
         v-if="removable"
         @click="destroy"></div>
  </div>
</template>

<script lang="ts">
 import Vue, { ComponentOptions } from 'vue';

 interface TagFilter extends Vue {
   name: string
   removable: boolean
   width: number
   destroy(): void
 }

 export default {
   name: 'tag-filter',
   props: {
     name: String,
     removable: {type: Boolean, default: true},
     width: {type: Number, default: 300}
   },
   methods: {
     destroy() {
       this.$emit('destroy', this.name);
     }
   }
 } as ComponentOptions<TagFilter>
</script>

<style>

 .tf-outer {
   display: inline-flex;
   align-items: stretch;
   text-align: center;
   box-sizing: border-box;
   border: 2px solid rgb(38, 127, 228);
   margin: 5px;
   border-radius: 5px;
   height: 40px; /* Height should match height of element UI inputs */
 }

 .tf-name {
   display: flex;
   align-items: center;
   padding: 5px;
   background-color: rgb(38, 127, 228);
   color: #fff;
 }

 .tf-value-container {
   display: flex;
 }

 .tf-value {
   display: flex;
   align-items: center;
   padding: 5px;
 }

 .tf-value-suffix {
   align-self: center;
   padding: 5px 5px 6px 0;
 }

 .tf-value-span {
   padding: 2px 0 1px 0;
   border-bottom: 1px dashed #000;
   text-decoration: none;
 }

 .tf-remove {
   align-self: center;
   cursor: pointer;
   padding: 5px 5px 5px 0;
 }

 .el-popover > .el-select {
   width: 100%;
 }

 /*
 .fade-leave-active {
   animation: remove-filter-animation 0.1s linear forwards;
 }

 @keyframes remove-filter-animation {
   from {
     opacity: 1;
     transform: translateY(0);
   }

   to {
     opacity: 0;
     transform : translateY(30px);
   }
 }
 */
</style>
