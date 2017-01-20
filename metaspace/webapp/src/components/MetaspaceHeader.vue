<template>
  <div class="b-header">
    <div class="header-item">
      <a style="display: flex" href="http://metasp.eu">
        <img src="http://metasp.eu/files/logo.png"
             alt="Metaspace" title="Metaspace"
             class="vc"></img>
      </a>
    </div>

    <router-link tag="div" to="/upload">
      <div class="header-item vc page-link">
        <div class="vc">Upload</div>
      </div>
    </router-link>

    <router-link tag="div" to="/annotations">
      <div class="header-item vc page-link">
        <div class="vc">Annotations</div>
      </div>
    </router-link>

    <router-link tag="div" to="/datasets">
      <div class="header-item vc page-link">
        <div class="vc">Datasets</div>
      </div>
    </router-link>

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
   background-color: rgba(0, 105, 224, 0.85);
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

 .router-link-active {
   box-shadow: inset 0 0 0 1px #357,inset 0 5px 10px #234;
 }

</style>
