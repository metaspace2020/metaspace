<template>
      <div class="dataset-list">
        <dataset-item v-for="(dataset, i) in datasets"
                      :dataset="dataset" :key="dataset.id"
                      :class="[i%2 ? 'even': 'odd']"
                      @filterUpdate="filter => $emit('filterUpdate', filter)">
        </dataset-item>
      </div>
</template>

<script>
  import DatasetItem from './DatasetItem.vue';
  export default {
    name: 'dataset-list',
    props: {
      datasets: {type: Array, required: true}
    },
    components: {
      DatasetItem,
    },
  }
</script>

<style lang="scss">
  .even {
    background-color: #e6f1ff;

    @media (min-width: 1650px) {
      background-color: white;
    }
  }

  .odd {
    background-color: white;
  }

  .dataset-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: stretch;
  }
</style>
