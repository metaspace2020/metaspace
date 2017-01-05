<template>
  <div class="b-header">
    <div class="header-item">
      <a style="display: flex" href="http://metasp.eu">
        <img src="http://metasp.eu/files/logo.png"
             alt="Metaspace" title="Metaspace"
             class="vert-centered"></img>
      </a>
    </div>

    <div class="header-item vert-centered">
      <a class="btn-link vert-centered" href="http://upload.metasp.eu"
          target="_blank">
        <el-button icon="upload">
          Upload a dataset
        </el-button>
      </a>
    </div>
  </div>
</template>

<script>
 export default {
   name: 'metaspace-header'
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
   margin-left: 15px;
   margin-right: 30px;
   height: 62px;
 }

 .vert-centered {
   align-self: center;
 }

 .btn-link {
   text-decoration: none;
   color: inherit;
 }
</style>
