<template>
  <tag-filter
    name="Adduct"
    removable
    @destroy="destroy"
  >
    <template v-slot:edit>
      <el-select
        :value="filterValues.adduct"
        placeholder="Select ionising adduct"
        filterable
        clearable
        remote
        @change="val => onChange('adduct', val)"
      >
        <el-option
          v-for="item in adductOptions"
          :key="item.adduct"
          :label="item.name"
          :value="item.adduct"
        />
      </el-select>
      <el-select
        v-if="showChemMods"
        :value="filterValues.chemMod"
        :remote-method="updateChemModQuery"
        :loading="chemModOptionsLoading !== 0"
        placeholder="Select chemical modification"
        filterable
        clearable
        remote
        @focus="() => updateChemModQuery('')"
        @change="val => onChange('chemMod', val)"
      >
        <el-option
          v-for="item in chemModOptions"
          :key="item.chemMod"
          :label="item.name"
          :value="item.chemMod"
        />
      </el-select>
      <el-select
        v-if="showNeutralLosses"
        :value="filterValues.neutralLoss"
        :remote-method="updateNeutralLossQuery"
        :loading="neutralLossOptionsLoading !== 0"
        placeholder="Select neutral loss"
        filterable
        clearable
        remote
        @focus="() => updateNeutralLossQuery('')"
        @change="val => onChange('neutralLoss', val)"
      >
        <el-option
          v-for="item in neutralLossOptions"
          :key="item.neutralLoss"
          :label="item.name"
          :value="item.neutralLoss"
        />
      </el-select>
    </template>

    <template v-slot:show>
      <span class="tf-value-span">
        <span>{{ formatValue }}</span>
      </span>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import TagFilter from './TagFilter.vue';
import { useStore } from 'vuex';
import {
  AdductSuggestion,
  chemModSuggestionQuery,
  neutralLossSuggestionQuery
} from "@/api/metadata";
import config from '../../../lib/config'

export default defineComponent({
  name: 'AdductFilter',
  components: {
    TagFilter
  },
  props: {
    filterValues: Object,
  },
  setup(props, { emit }) {
    // Accessing the Vuex store using useStore
    const store = useStore();

    // Creating reactive state variables
    const chemModQuery = ref('');
    const neutralLossQuery = ref('');


    // Apollo GraphQL queries
    const { result: chemModOptionsResult, loading: chemModOptionsLoading } = useQuery(
      chemModSuggestionQuery,
      () => ({ query: chemModQuery.value })
    );
    const { result: neutralLossOptionsResult, loading: neutralLossOptionsLoading } = useQuery(
      neutralLossSuggestionQuery,
      () => ({ query: neutralLossQuery.value })
    );

    // Computed property for chemModOptions
    const chemModOptions = computed(() => {
      const chemMods = chemModOptionsResult.value?.chemMods || []
      return [
        ...(chemModQuery.value ? [] : [{ chemMod: 'none', name: 'No chemical modification' }]),
        ...chemMods,
      ];
    });

    // Computed property for neutralLossOptions
    const neutralLossOptions = computed(() => {
      const neutralLosses = neutralLossOptionsResult.value?.neutralLosses  || []
      return [
        ...(neutralLossQuery.value ? [] : [{ neutralLoss: 'none', name: 'No neutral loss' }]),
        ...neutralLosses,
      ];
    });

    // Accessing the Vuex state
    const filterLists = computed(() => store.state.filterLists || { adducts: [] });

    // Computed property to format the display value
    const formatValue = computed(() => {
      const { chemMod, neutralLoss, adduct } = props.filterValues;
      let suffix = '';
      if (chemMod && chemMod !== 'none') {
        suffix += chemMod;
      }
      if (neutralLoss && neutralLoss !== 'none') {
        suffix += neutralLoss;
      }
      suffix = suffix.replace(/([+-])/g, ' $1 ');

      if (adduct) {
        const adductInfo = filterLists.value.adducts.find((a: any) => a.adduct === adduct);
        return (adductInfo && adductInfo.name || adduct).replace(']', suffix + ']');
      } else if ((chemMod && chemMod !== 'none') || (neutralLoss && neutralLoss !== 'none')) {
        return `[M + ?${suffix}]`;
      } else if (chemMod === 'none' && neutralLoss === 'none') {
        return 'Only ionising adducts';
      } else if (chemMod === 'none') {
        return 'No chemical modification';
      } else if (neutralLoss === 'none') {
        return 'No neutral loss';
      } else {
        return '(Any)';
      }
    });

    // Method to update the chemMod query
    const updateChemModQuery = (query: string) => {
      chemModQuery.value = query;
    };

    // Method to update the neutralLoss query
    const updateNeutralLossQuery = (query: string) => {
      neutralLossQuery.value = query;
    };

    // Method to update the neutralLoss query
    const showChemMods = () => {
      return config.features.chem_mods || props.filterValues?.chemMod != null
    };

    const showNeutralLosses = () => {
      return config.features.neutral_losses || props.filterValues?.neutralLoss != null
    }

    const adductOptions = () =>  {
      return this.filterLists.adducts
        .filter((a: AdductSuggestion) => config.features.all_adducts || !a.hidden)
    }


    // Method to handle changes in filter options
    const onChange = (filterKey: 'chemMod' | 'neutralLoss' | 'adduct', val: any) => {
      if (val) {
        emit('change', val, filterKey);
      } else {
        emit('destroy', filterKey);
      }
    };

    // Method to handle the destruction of a filter
    const destroy = () => {
      emit('destroy', 'chemMod');
      emit('destroy', 'neutralLoss');
      emit('destroy', 'adduct');
    };

    // Exposing properties and methods to the template
    return {
      chemModOptions,
      chemModOptionsLoading,
      neutralLossOptions,
      neutralLossOptionsLoading,
      updateChemModQuery,
      updateNeutralLossQuery,
      formatValue,
      onChange,
      destroy,
      showChemMods,
      showNeutralLosses,
      adductOptions
    };
  }
});
</script>


<style scoped>
.el-select {
  width: 100%;
}
</style>
