<template>
  <div class="b-header">
    <div class="header-item">
      <a style="display: flex" href="http://metasp.eu">
        <img src="http://metasp.eu/files/logo.png"
             alt="Metaspace" title="Metaspace"
             class="vc"></img>
      </a>
    </div>

    <div class="header-item vc">
      <a class="btn-link vc" href="http://upload.metasp.eu"
          target="_blank">
        <el-button icon="upload">
          Upload a dataset
        </el-button>
      </a>
    </div>

    <div v-for="page in pages"
         class="header-item vc page-link"
         v-bind:class="{active: value == page.id}"
         @click="goto(page.id)">
      <div class="vc">
        {{ page.name }}
      </div>
    </div>
  </div>
</template>

<script>
 export default {
   name: 'metaspace-header',
   props: ["value"],
   data() {
     return {
       pages: [
         {id: 'results', name: 'Results'},
         {id: 'datasets', name: 'Datasets'}
       ]
     };
   },
   methods: {
     goto(page) {
       this.$emit('input', page);
     }
   }
 }
</script>

<style>
 /* bits and pieces copy-pasted from metasp.eu */
 .b-header {
   background-color: rgba(0, 105, 224, 0.9);
   position: fixed;
   z-index: 1000;
   top: 0;
   left: 0;
   right: 0;
   height: 62px;
   display: flex;
 }

 .header-item {
   display: flex;
   float: left;
   border: none;
   padding-left: 15px;
   padding-right: 15px;
   height: 62px;
 }

 /* vertically centered */
 .vc {
   align-self: center;
 }

 .btn-link {
   text-decoration: none;
   color: inherit;
 }

 .page-link {
   text-align: center;
   color: white;
   cursor: pointer;
 }

 .page-link.active {
   box-shadow: inset 0 0 0 1px #357,inset 0 5px 10px #234;
 }
</style>
