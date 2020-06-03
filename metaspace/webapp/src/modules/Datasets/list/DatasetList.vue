<template>
  <div
    class="dataset-list"
    :class="{'double-column': isDoubleColumn, 'allow-double-column': allowDoubleColumn}"
  >
    <dataset-item
      v-for="(dataset, i) in datasets"
      :key="dataset.id"
      :dataset="dataset"
      :current-user="currentUser"
      :idx="i"
      :hide-group-menu="hideGroupMenu"
      @filterUpdate="filter => $emit('filterUpdate', filter)"
      @datasetMutated="$emit('datasetMutated')"
    />
    <div
      v-if="datasets == null || datasets.length === 0"
      class="datasets-list-empty"
    >
      No datasets found
    </div>
  </div>
</template>

<script>
import DatasetItem from './DatasetItem.vue'
import { currentUserRoleQuery } from '../../../api/user'

/** @type {ComponentOptions<Vue> & Vue} */
const DatasetList = {
  name: 'dataset-list',
  props: {
    datasets: { type: Array, required: true },
    allowDoubleColumn: { type: Boolean, default: false },
    hideGroupMenu: { type: Boolean, default: false },
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
    const widthQuery = window.matchMedia ? window.matchMedia('(min-width: 1650px)') : null
    return {
      widthQuery,
      isDoubleColumn: this.allowDoubleColumn && widthQuery != null && widthQuery.matches,
    }
  },
  created() {
    if (this.widthQuery != null) {
      this.widthQuery.addListener(this.computeDoubleColumn)
    }
  },
  beforeDestroy() {
    if (this.widthQuery != null) {
      this.widthQuery.removeListener(this.computeDoubleColumn)
    }
  },
  methods: {
    computeDoubleColumn() {
      if (this.widthQuery != null) {
        this.isDoubleColumn = this.allowDoubleColumn && this.widthQuery.matches
      }
    },
  },
}
export default DatasetList
</script>

<style scoped lang="scss">
  .dataset-list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    margin: -3px;
  }

  .double-column {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .double-column {
    > .dataset-item {
      width: calc(50% - 8px);
      flex-basis: calc(50% - 8px);
      // NOTE: In IE11, box-sizing:border-box is ignored in flex-basis calculations, so it's reverted to the
      // default value here.
    }
  }

  .datasets-list-empty {
    @apply text-gray-600;
    display: flex;
    height: 200px;
    width: 100%;
    align-items: center;
    justify-content: center;
  }
</style>
