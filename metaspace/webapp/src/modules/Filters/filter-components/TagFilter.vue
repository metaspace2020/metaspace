<template>
  <div class="tf-outer">
    <div class="tf-name">
      <slot name="name">
        {{ name }}:
      </slot>
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

<style lang="scss">

 .tf-outer {
   display: flex;
   align-items: stretch;
   text-align: center;
   box-sizing: border-box;
   border: 2px solid rgb(38, 127, 228);
   margin: 5px;
   border-radius: 5px;
   height: 40px; /* Height should match height of element UI inputs */
   max-width: 300px;
 }

 .tf-name {
   display: flex;
   align-items: center;
   padding: 5px;
   background-color: rgb(38, 127, 228);
   color: #fff;
   flex: none;
 }

 .tf-value-container {
   display: flex;
   overflow: hidden;
 }

 .tf-value {
   display: flex;
   align-items: center;
   padding: 5px;
   overflow: hidden;
   flex: auto;
 }

 .tf-value-suffix {
   align-self: center;
   padding: 5px 5px 6px 0;
   white-space: nowrap;
 }

 .tf-value-span {
   flex: auto;
   padding: 2px 0 1px 0;
   border-bottom: 1px dashed #000;
   text-decoration: none;
   text-align: start;
   text-overflow: ellipsis;
   overflow: hidden;
   white-space: nowrap;
 }

  .tf-value-input input, input.tf-value-input {
    border: none;
    // This takes styles from "html" and "#app" in App.vue to make the text match the other filters
    font-family: 'Roboto', Helvetica, sans-serif;
    font-size: 1rem;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: #2c3e50;

    &::-ms-clear {
      display: none;
    }
    &[type='number'] {
      width: 100px; // IE11 fix - inputs without a "width" won't follow flex-shrink rules
      -moz-appearance: textfield; // Firefox fix - something is broken with the up/down buttons on input[type='number']s on win 10 so just hide them
    }
    &[type='text'] {
      width: 200px; // IE11 fix - inputs without a "width" won't follow flex-shrink rules
    }
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
