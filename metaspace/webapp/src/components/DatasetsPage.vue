<template>
  <el-row>
    <div id="dataset-page">
      <div id="dataset-page-contents">
        <router-view></router-view>
      </div>
    </div>
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

<style lang="scss">

  #dataset-page {
    display: flex;
    justify-content: center;
  }

  /* 1 dataset per row by default*/
  #dataset-page-contents {
    display: inline-block;
    width: 820px;

    @media (min-width: 1650px) {
      /* 2 datasets per row on wide screens */
      width: 1620px;
    }
  }
</style>
