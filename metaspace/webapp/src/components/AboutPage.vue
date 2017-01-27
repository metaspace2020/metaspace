<template>
  <el-row>
    <div id="about">
      <div v-html="require('../about.md')">
      </div>
    </div>
  </el-row>
</template>

<script>
 export default {
   name: 'about-page'
 }
</script>

<style>
 #about {
   display: flex;
   padding: 0px 20px;
   align-items: center;
   justify-content: center;
 }

 #about > div {
   max-width: 900px;
 }
</style>
