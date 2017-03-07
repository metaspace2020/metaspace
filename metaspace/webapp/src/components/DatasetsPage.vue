<template>
  <el-row>
    <router-view></router-view>
  </el-row>
</template>

<script>

 export default {
   name: 'datasets-page',
   created() {
     this.$store.commit('updateFilter', this.$store.getters.filter);
   }
 }
</script>
