<template>
  <div class="b-header">
    <div class="header-item" id="metasp-logo">
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

    <router-link tag="div" to="/datasets">
      <div class="header-item vc page-link">
        <div class="vc">Datasets</div>
      </div>
    </router-link>

    <router-link tag="div" to="/annotations">
      <div class="header-item vc page-link">
        <div class="vc">Annotations</div>
      </div>
    </router-link>

    <router-link tag="div" to="/about">
      <div class="header-item vc page-link">
        <div class="vc">About</div>
      </div>
    </router-link>
  </div>
</template>

<script>
 export default {
   name: 'metaspace-header',
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
   padding: 0px 20px;
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
   color: #eee;
   cursor: pointer;
 }

 .router-link-active > .page-link, .page-link:hover {
   background: rgba(0, 0, 0, 0.1);
   outline-color: rgba(0, 0, 0, 0.3);
   outline-style: solid;
   outline-width: 1px;
 }

 .page-link:hover {
   background: rgba(0, 0, 0, 0.1);
   outline-color: rgba(0, 0, 0, 0.3);
   outline-style: solid;
   outline-width: 1px;
 }

 .router-link-active > .page-link {
   font-weight: 700;
   color: white;
 }

 .page-link:hover > .vc {
   color: white;
 }

 #metasp-logo {
   padding-left: 15px;
 }
</style>
