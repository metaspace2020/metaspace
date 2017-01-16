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
         @click="destroy"></div>
  </div>
</template>

<script>

 export default {
   name: 'tag-filter',
   props: ["name"],
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
   border: 2px solid #3614CC;
   padding: 0px;
   margin: 0px 5px 7px 5px;
   border-radius: 8px;
 }

 .tf-name {
   display: inline-block;
   padding: 7px 5px 7px 5px;
   background-color: #9740ff;
   color: white;
 }

 .tf-value {
   padding: 7px 0px 7px 0px;
   display: inline-block;
 }

 .tf-value-span {
   border-bottom: 1px dashed #000;
   text-decoration: none;
 }

 .tf-remove {
   display: inline-block;
   cursor: pointer;
   padding: 7px 5px 7px 3px;
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
