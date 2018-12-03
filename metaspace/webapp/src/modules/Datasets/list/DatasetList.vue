<template>
  <div class="dataset-list" :class="{'double-column': isDoubleColumn, 'allow-double-column': allowDoubleColumn}">
    <dataset-item v-for="(dataset, i) in datasets"
                  :dataset="dataset" :key="dataset.id"
                  :class="i%2 ? 'odd': ''"
                  :currentUser="currentUser"
                  :idx="i"
                  :hideGroupMenu="hideGroupMenu"
                  @filterUpdate="filter => $emit('filterUpdate', filter)"
                  @datasetMutated="$emit('datasetMutated')">
    </dataset-item>
  </div>
</template>

<script>
  import DatasetItem from './DatasetItem.vue';
  import {currentUserRoleQuery} from '../../../api/user';

  export default {
    name: 'dataset-list',
    props: {
      datasets: {type: Array, required: true},
      allowDoubleColumn: {type: Boolean, default: false},
      hideGroupMenu: {type: Boolean, default: false}
    },
    components: {
      DatasetItem,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
    },
    data() {
      // window.matchMedia is present on all our supported browsers, but not available in jsdom for tests
      const widthQuery = window.matchMedia ? window.matchMedia('(min-width: 1650px)') : null;
      return {
        widthQuery,
        isDoubleColumn: this.allowDoubleColumn && widthQuery != null && widthQuery.matches,
      }
    },
    created() {
      if (this.widthQuery != null) {
        this.widthQuery.addListener(this.computeDoubleColumn);
      }
    },
    beforeDestroy() {
      if (this.widthQuery != null) {
        this.widthQuery.removeListener(this.computeDoubleColumn);
      }
    },
    methods: {
      computeDoubleColumn() {
        if (this.widthQuery != null) {
          this.isDoubleColumn = this.allowDoubleColumn && this.widthQuery.matches;
        }
      }
    }
  }
</script>

<style scoped lang="scss">
  .allow-double-column {
    >.dataset-item {
      max-width: 800px;
    }
  }

  .dataset-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: stretch;

    &:not(.double-column) {
      .odd {
        background-color: #e6f1ff;
      }
    }
  }
</style>
