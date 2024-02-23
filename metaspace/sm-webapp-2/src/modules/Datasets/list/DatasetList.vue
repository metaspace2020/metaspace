<template>
  <div class="dataset-list" :class="{ 'double-column': isDoubleColumn, 'allow-double-column': allowDoubleColumn }">
    <dataset-item
      v-for="(dataset, i) in datasets"
      :key="dataset.id"
      :dataset="dataset"
      :current-user="currentUser"
      :idx="i"
      :hide-group-menu="hideGroupMenu"
      @filterUpdate="(filter) => $emit('filterUpdate', filter)"
      @datasetMutated="$emit('datasetMutated')"
    />
    <div v-if="datasets == null || datasets.length === 0" class="datasets-list-empty">No datasets found</div>
  </div>
</template>

<script>
import { defineComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import DatasetItem from './DatasetItem.vue'
import { useQuery } from '@vue/apollo-composable'
import { currentUserRoleQuery } from '../../../api/user'

export default defineComponent({
  name: 'DatasetList',
  components: {
    DatasetItem,
  },
  props: {
    datasets: { type: Array, required: true },
    allowDoubleColumn: { type: Boolean, default: false },
    hideGroupMenu: { type: Boolean, default: false },
  },
  setup(props) {
    const { result: currentUser } = useQuery(currentUserRoleQuery, null, { fetchPolicy: 'cache-first' })

    // window.matchMedia is present on all our supported browsers, but not available in jsdom for tests
    const widthQuery = window.matchMedia ? window.matchMedia('(min-width: 1650px)') : null

    const isDoubleColumn = ref(props.allowDoubleColumn && widthQuery != null && widthQuery.matches)

    const computeDoubleColumn = () => {
      isDoubleColumn.value = props.allowDoubleColumn && matchMedia('(min-width: 1650px)').matches
    }

    watch(() => props.allowDoubleColumn, computeDoubleColumn)

    onMounted(() => {
      if (widthQuery != null) {
        widthQuery.addListener(computeDoubleColumn)
      }
    })

    onBeforeUnmount(() => {
      if (widthQuery != null) {
        widthQuery.removeListener(computeDoubleColumn)
      }
    })

    return { currentUser, isDoubleColumn }
  },
})
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
