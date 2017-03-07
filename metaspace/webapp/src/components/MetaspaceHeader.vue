<template>
  <div class="b-header">
    <div class="header-item" id="metasp-logo">
      <a style="display: flex" href="http://metasp.eu">
        <img src="../assets/logo.png"
             alt="Metaspace" title="Metaspace"
             style="border: 0px;"
             class="vc"></img>
      </a>
    </div>

    <router-link to="/upload">
      <div class="header-item vc page-link">
        <div class="vc">Upload</div>
      </div>
    </router-link>

    <router-link :to="datasetsHref">
      <div class="header-item vc page-link">
        <div class="vc">Datasets</div>
      </div>
    </router-link>

    <router-link :to="annotationsHref">
      <div class="header-item vc page-link">
        <div class="vc">Annotations</div>
      </div>
    </router-link>

    <router-link to="/about">
      <div class="header-item vc page-link">
        <div class="vc">About</div>
      </div>
    </router-link>
  </div>
</template>

<script>
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';
 import {encodeParams} from '../filterToUrl.js';

 export default {
   name: 'metaspace-header',
   computed: {
     datasetsHref() {
       const path = '/datasets';
       const link = {
         path,
         query: encodeParams(this.$store.getters.filter, '/datasets')
       };
       return link;
     },

     annotationsHref() {
       const path = '/annotations',
             lastParams = this.$store.state.lastUsedFilters[path];
       let f = lastParams ? lastParams.filter : {};
       f = Object.assign({}, f, this.$store.getters.filter);
       const link = {
         path,
         query: encodeParams(f, '/annotations')
       };
       return link;
     }
   }
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
