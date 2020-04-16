<template>
  <div>
    <div class="dataset-checkbox-list">
      <div
        v-for="dataset in datasets"
        :key="dataset.id"
        class="mb-1"
      >
        <el-checkbox v-model="selectedDatasets[dataset.id]">
          {{ dataset.name }}
          <span class="text-gray-700 proportional-nums">(submitted <elapsed-time :date="dataset.uploadDT" />)</span>
        </el-checkbox>
      </div>
    </div>
    <div class="select-buttons">
      <a
        href="#"
        @click.prevent="handleSelectNone"
      >Select none</a>
      <span> | </span>
      <a
        href="#"
        @click.prevent="handleSelectAll"
      >Select all</a>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Model, Prop, Watch } from 'vue-property-decorator'
import { DatasetListItem } from '../api/dataset'
import { fromPairs } from 'lodash-es'

import ElapsedTime from '../components/ElapsedTime'

@Component({
  name: 'DatasetCheckboxList',
  components: {
    ElapsedTime,
  },
})
export default class DatasetCheckboxList extends Vue {
    @Prop({ type: Array, required: true })
    datasets!: DatasetListItem[];

    @Model('input')
    selectedDatasets!: Record<string, boolean>;

    @Watch('datasets')
    populateSelectedDatasetIds() {
      // Rebuild `selectedDatasets` so that the keys are in sync with the ids from `datasets`
      const selectedDatasets = fromPairs(this.datasets.map(({ id }) => {
        return [id, id in this.selectedDatasets ? this.selectedDatasets[id] : true]
      }))
      this.$emit('input', selectedDatasets)
    }

    created() {
      this.populateSelectedDatasetIds()
    }

    getDate() {
      console.log(this.datasets)
      return ''
      // console.log(this.dataset && this.date.uploadDT)
      // return this.datasets !== null && this.dataset.uploadDT
    }

    handleSelectNone() {
      Object.keys(this.selectedDatasets).forEach(key => { this.selectedDatasets[key] = false })
    }

    handleSelectAll() {
      Object.keys(this.selectedDatasets).forEach(key => { this.selectedDatasets[key] = true })
    }
}
</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .dataset-checkbox-list {
    margin: 20px;
    max-height: 50vh;
    overflow: auto;
  }
  .select-buttons {
    text-align: right;
    margin: 20px;
  }
</style>
