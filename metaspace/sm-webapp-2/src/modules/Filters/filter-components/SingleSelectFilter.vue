<template>
  <tag-filter
    :name="name"
    :removable="removable"
    :help-component="helpComponent"
    @destroy="destroy"
  >
    <template v-slot:edit>
      <el-select
        :filterable="filterable"
        :clearable="clearable"
        :model-value="value"
        @change="onChange"
      >
        <el-option
          v-for="(item, idx) in options"
          :key="idx"
          :label="formatOption(item)"
          :value="valueGetter ? valueGetter(item) : item"
        />
      </el-select>
    </template>

    <template v-slot:show>
      <span class="tf-value-span">
        <span v-if="value != null && value !== ''">{{ formatValue(value) }}</span>
        <span v-else>(any)</span>
      </span>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue'
import TagFilter from './TagFilter.vue'

export default defineComponent({
  name: 'SingleSelectFilter',
  components: {
    TagFilter,
  },
  props: {
    value: {
      type: [String, Number, Object, Boolean],
      default: undefined,
    },
    name: {
      type: String,
      required: true,
    },
    helpComponent: {
      type: [String, Object],
      default: null,
    },
    options: {
      type: Array,
      required: true,
    },
    optionFormatter: Function,
    valueGetter: Function,
    clearable: {
      type: Boolean,
      default: false,
    },
    removable: {
      type: Boolean,
      default: true,
    },
    filterable: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['change', 'destroy'],
  setup(props, { emit }) {
    const localValue = ref(props.value);

    watch(() => props.value, (newValue) => {
      localValue.value = newValue;
    });

    const onChange = (val: any) => {
      emit('change', val);
    };

    const formatOption = (option: any): string => {
      if (props.optionFormatter) {
        return props.optionFormatter(option, props.options);
      } else {
        return option + '';
      }
    };

    const formatValue = (value: any): string => {
      if (props.valueGetter) {
        const option = props.options.find(opt => props.valueGetter!(opt) === value);
        return option != null ? formatOption(option) : value;
      } else {
        return value != null ? formatOption(value) : value;
      }
    };

    const destroy = () => {
      emit('destroy');
    };

    return { localValue, onChange, formatOption, formatValue, destroy };
  },
});
</script>
