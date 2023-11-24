<template>
  <tag-filter
    :name="name"
    :removable="removable && !loading"
    :width="multiple ? 900 : 300"
    @destroy="destroy"
  >
    <template v-slot:edit>
      <el-select
        ref="select"
        placeholder="Start typing name"
        remote
        filterable
        :clearable="clearable"
        :remote-method="fetchOptions"
        :loading="loading"
        loading-text="Loading matching entries..."
        no-match-text="No matches"
        :multiple="multiple"
        :multiple-limit="10"
        :model-value="safeValue"
        :teleported="false"
        @update:model-value="onInput"
      >
        <el-option
          v-for="item in joinedOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
    </template>

    <template v-slot:show>
      <span class="tf-value-span">
        <span v-if="valueAsArray.length === 1">
          {{ currentLabel }}
        </span>
        <span v-if="valueAsArray.length > 1">
          ({{ value.length }} items selected)
        </span>
        <span v-if="valueAsArray.length === 0">
          (any)
        </span>
      </span>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch, nextTick, computed } from 'vue';
import { useStore } from 'vuex';
import { ElSelect } from 'element-plus';
import TagFilter from './TagFilter.vue';
import searchableFilterQueries, { Option } from './searchableFilterQueries';
import apolloClient from "@/api/graphqlClient";

export default defineComponent({
  name: 'SearchableFilter',
  components: {
    TagFilter,
    ElSelect,
  },
  props: {
    name: { type: String, required: true },
    multiple: { type: Boolean, default: false },
    clearable: { type: Boolean, default: true },
    value: [String, Array],
    filterKey: { type: String, required: true },
    removable: { type: Boolean, default: true },
  },
  emits: ['input', 'change', 'destroy'],
  setup(props, { emit }) {
    const store = useStore();
    const loading = ref(false);
    const options = ref<Option[]>([]);
    const cachedOptions = ref<Option[]>([]);
    const currentLabel = ref('');
    const select = ref<any>(null);

    const valueAsArray = computed(() => {
      return props.multiple
        ? (props.value || []) as string[]
        : props.value ? [props.value] : [];
    });

    const safeValue = computed(() => {
      return props.multiple ? valueAsArray.value : props.value;
    });

    const joinedOptions = computed(() => {
      // adds/moves selected values to the top of the options list

      const valueToLabel: Record<string, string> = {}
      for (const { value, label } of cachedOptions.value) {
        valueToLabel[value] = label
      }

      const values = valueAsArray.value.slice()
      const optionsAux = values.map(value => ({ value, label: valueToLabel[value] }))

      // add currently selected values to the list
      for (let i = 0; i < options.value.length; i++) {
        const item = options.value[i]
        if (values.indexOf(item.value) === -1) {
          values.push(item.value)
          optionsAux.push(item)
        }
      }

      return optionsAux
    });

    const fetchNames = async () => {
      const foundOptions = [];
      const missingValues = [];

      valueAsArray.value.forEach(value => {
        const option = cachedOptions.value.find(option => option.value === value)
          || options.value.find(option => option.value === value); // props.options should be a reactive prop
        if (option != null) {
          foundOptions.push(option);
        } else {
          missingValues.push(value);
        }
      });

      cachedOptions.value = foundOptions;

      if (missingValues.length > 0) {
        const options = await searchableFilterQueries[props.filterKey].getById(apolloClient, valueAsArray.value);
        cachedOptions.value.push(...options);
      }

      if (valueAsArray.value.length === 1) {
        // data.options.length may be 0 if an invalid ID is passed due to URL truncation or a dataset becoming hidden
        currentLabel.value = foundOptions.length > 0 ? foundOptions[0].label : valueAsArray.value[0];
      }

      nextTick(() => {
        if (select.value != null && typeof select.value.setSelected === 'function') {
          select.value.setSelected();
        }
      });
    };


    watch(() => props.value, fetchNames, { immediate: true });




    const fetchOptions = async (query) => {
      loading.value = true;

      try {
        // Assuming searchableFilterQueries is an external API or utility
        options.value = await searchableFilterQueries[props.filterKey].search(apolloClient, store, query);
      } catch (err) {
        options.value = [];
        throw err;
      } finally {
        loading.value = false;
      }
    }

    function onInput(val: string) {
      emit('input', val);
      emit('change', val);
    }

    function destroy() {
      emit('destroy');
    }

    onMounted(() => {
      fetchNames()
      fetchOptions('')
    });

    return {
      loading,
      options,
      fetchOptions,
      onInput,
      destroy,
      valueAsArray,
      safeValue,
      joinedOptions,
      currentLabel,
      select
    };
  },
});
</script>

<style>
  .el-select-dropdown.is-multiple .el-select-dropdown__wrap {
    max-height: 600px;
  }
</style>
