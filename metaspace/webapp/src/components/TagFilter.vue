<template>
  <div class="tf-outer">
    <div class="tf-name">
      {{ name }}:
    </div>

    <el-popover trigger="click"
                placement="top"
                width="300px">
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

<script>

 export default {
   name: 'tag-filter',
   props: {
     name: String,
     removable: {type: Boolean, default: true}
   },
   methods: {
     destroy() {
       this.$emit('destroy', this.name);
     }
   }
 }
</script>

<style>

 .tf-outer {
   display: inline-block;
   text-align: center;
   border: 2px solid rgb(38, 127, 228);
   padding: 0 5px 0 0;
   margin: 0 5px 7px;
   border-radius: 5px;
 }

 .tf-name {
   display: inline-block;
   padding: 7px 5px;
   background-color: rgb(38, 127, 228);
   color: #fff;
 }

 .tf-value {
   display: inline-block;
 }

 .tf-value-span {
   border-bottom: 1px dashed #000;
   text-decoration: none;
 }

 .tf-remove {
   display: inline-block;
   cursor: pointer;
   padding: 7px 0px 7px 3px;
 }

 .el-popover {
   min-width: 440px;
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
