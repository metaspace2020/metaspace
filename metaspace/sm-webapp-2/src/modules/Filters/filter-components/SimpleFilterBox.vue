<template>
  <el-select
    class="filter-select"
    :model-value="value"
    @change="onChange"
  >
    <el-option
      v-for="opt in ungroupedOptions"
      :key="opt.value"
      :value="opt.value"
      :label="opt.label"
    />
    <el-option-group
      v-for="grp in groupedOptions"
      :key="grp.label"
      :label="grp.label"
    >
      <el-option
        v-for="opt in grp.options"
        :key="opt.value"
        :value="opt.value"
        :label="opt.label"
      />
    </el-option-group>
  </el-select>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { groupBy } from 'lodash-es';
// import { FilterKey } from '../filterSpecs'

// interface SimpleFilterOption {
//   value: string;
//   label: string;
//   group?: string;
//   filter?: Partial<Record<FilterKey, any>>; // Ensure FilterKey is imported or defined
// }

// interface SimpleFilterGroup {
//   label: string;
//   options: SimpleFilterOption[];
// }

export default defineComponent({
  name: 'SimpleFilterBox',
  components: {
  },
  props: {
    name: String,
    value: String,
    options: {
      type: Array,
      default: () => [] // Providing a default empty array
    }
  },
  setup(props, { emit }) {
    const ungroupedOptions = computed(() =>
      props.options!.filter(opt => opt.group == null)
    );

    const groupedOptions = computed(() => {
      const optionsWithGroup = props.options!.filter(opt => opt.group != null);
      const groupMap = groupBy(optionsWithGroup, 'group');
      return Object.entries(groupMap).map(([label, options]) => ({ label, options }));
    });

    const selectedLabel = computed(() => {
      const option = props.options!.find(opt => opt.value === props.value);
      return option ? option.label : '';
    });

    const onChange = (val: string) => {
      emit('update:value', val);
      emit('change', val);
    };

    return { ungroupedOptions, groupedOptions, selectedLabel, onChange };
  }
});
</script>
