<template>
  <el-row>
    <div id="dataset-page">
      <div id="dataset-page-contents">
        <router-view />
      </div>
    </div>
  </el-row>
</template>

<script>

export default {
  name: 'DatasetsPage',
  created() {
    this.$store.commit('updateFilter', this.$store.getters.filter)
  },
}
</script>

<style lang="scss">

  #dataset-page {
    display: flex;
    justify-content: center;
  }

  /* 1 dataset per row by default*/
  #dataset-page-contents {
    width: 820px;
    margin: 0 5px;

    @media (min-width: 1650px) {
      /* 2 datasets per row on wide screens */
      width: 1620px;

      .dataset-item {
        // if there is an odd number of datasets, ensure the last item in the list doesn't expand to fill the row
        flex-grow: 0;
      }
    }
  }
</style>
