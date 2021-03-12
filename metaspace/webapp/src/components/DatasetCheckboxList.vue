<template>
  <div>
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
    <div class="dataset-checkbox-list leading-6">
      <div
        v-for="dataset in datasets"
        :key="dataset.id"
      >
        <el-checkbox
          v-model="selectedDatasets[dataset.id]"
          class="flex h-6 items-center"
        >
          <span
            class="truncate"
            :title="dataset.name"
          >
            {{ dataset.name }}
          </span>
          <span class="text-gray-700 text-xs tracking-wide pl-1">
            <elapsed-time :date="dataset.uploadDT" />
          </span>
        </el-checkbox>
      </div>
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

    @Prop({ default: false })
    initSelectAll!: boolean;

    @Model('input')
    selectedDatasets!: Record<string, boolean>;

    @Watch('datasets')
    populateSelectedDatasetIds() {
      // Rebuild `selectedDatasets` so that the keys are in sync with the ids from `datasets`
      const selectedDatasets = fromPairs(this.datasets.map(({ id }) => {
        return [id, id in this.selectedDatasets ? this.selectedDatasets[id] : this.initSelectAll]
      }))
      this.$emit('input', selectedDatasets)
    }

    created() {
      this.populateSelectedDatasetIds()
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
  .dataset-checkbox-list {
    margin: 12px 0;
    max-height: 50vh;
    overflow: auto;
  }
  .select-buttons {
    margin: 12px 0;
  }
  /deep/ .el-checkbox__label {
    @apply inline-flex flex-grow justify-between items-baseline overflow-hidden;
  }
</style>
