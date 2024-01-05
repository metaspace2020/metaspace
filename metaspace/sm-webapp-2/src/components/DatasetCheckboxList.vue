<template>
  <div>
    <div class="select-buttons">
      <a href="#" @click.prevent="handleSelectNone">Select none</a>
      <span> | </span>
      <a href="#" @click.prevent="handleSelectAll">Select all</a>
    </div>
    <div class="dataset-checkbox-list leading-6">
      <div v-for="dataset in datasets" :key="dataset.id">
        <el-checkbox
          :model-value="selectedDatasets[dataset.id]"
          class="flex h-6 items-center"
          @click="() => handleChange(dataset.id)"
        >
          <span class="truncate" :title="dataset.name">
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
import { defineComponent, ref, watch } from 'vue';
import ElapsedTime from '../components/ElapsedTime';
import {ElCheckbox} from "element-plus";
import { DatasetListItem } from '../api/dataset'

export default defineComponent({
  name: 'DatasetCheckboxList',
  components: {
    ElapsedTime,
    ElCheckbox,
  },
  props: {
    datasets: {
      type: Array as () => DatasetListItem[],
      required: true,
    },
    initSelectAll: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const selectedDatasets = ref({});

    const populateSelectedDatasetIds = () => {
      // Rebuild `selectedDatasets` so that the keys are in sync with the ids from `datasets`
      const newSelectedDatasets = {};
      props.datasets.forEach(dataset => {
        newSelectedDatasets[dataset.id] = dataset.id in selectedDatasets.value
          ? selectedDatasets.value[dataset.id]
          : props.initSelectAll;
      });
      selectedDatasets.value = newSelectedDatasets;
      emit('update:selectedDatasets', newSelectedDatasets);
    };

    watch(() => props.datasets, populateSelectedDatasetIds, { immediate: true });

    const handleChange = (datasetId: string) => {
      const newValue = !selectedDatasets.value[datasetId]
       selectedDatasets.value[datasetId] = newValue
       emit('update:modelValue', selectedDatasets.value);
    }


    const handleSelectNone = () => {
      Object.keys(selectedDatasets.value).forEach(key => { selectedDatasets.value[key] = false });
      emit('update:modelValue', selectedDatasets.value);
    };

    const handleSelectAll = () => {
      Object.keys(selectedDatasets.value).forEach(key => { selectedDatasets.value[key] = true });
      emit('update:modelValue', selectedDatasets.value);
    };

    return {
      selectedDatasets,
      handleSelectNone,
      handleSelectAll,
      handleChange,
    };
  },
});
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
  ::v-deep(.el-checkbox__label) {
    @apply inline-flex flex-grow justify-between items-baseline overflow-hidden;
  }
</style>
