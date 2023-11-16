<template>
  <tag-filter
    name="Class"
    removable
    @destroy="destroy"
  >
    <template v-slot:edit>
      <el-select
        :value="filterValues.adduct"
        placeholder="Select molecular ontology"
        filterable
        clearable
        remote
        @change="val => onChange('molClass', val)"
      >
        <el-option
          v-for="item in molClasses"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select
        :value="filterValues.term ? parseInt(filterValues.term, 10) : undefined"
        :remote-method="updateTermQuery"
        :loading="termOptionsLoading !== 0"
        placeholder="Select term"
        filterable
        clearable
        remote
        @focus="() => updateTermQuery('')"
        @change="val => onChange('term', val)"
      >
        <el-option
          v-for="item in termOptions"
          :key="item.id"
          :label="item.enrichmentName"
          :value="item.id"
        />
      </el-select>
    </template>
    <template v-slot:show>
      <span class="tf-value-span">{{ formatValue }}</span>
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import TagFilter from './TagFilter.vue';
import { useStore } from 'vuex';
import {chemModSuggestionQuery, neutralLossSuggestionQuery} from "@/api/metadata";

export default defineComponent({
  name: 'AdductFilter',
  components: {
    TagFilter
  },
  props: {
    filterValues: Object,
  },
  setup(props, { emit }) {
    const store = useStore(); // Vuex store
    const filterValues = ref(props.filterValues);
    const chemModQuery = ref('');
    const neutralLossQuery = ref('');

    console.log('filterValues', filterValues.value)

    // Define Apollo queries
    const CHEM_MOD_OPTIONS_QUERY = chemModSuggestionQuery;
    const NEUTRAL_LOSS_OPTIONS_QUERY = neutralLossSuggestionQuery;

    const { result: chemModOptionsResult, loading: chemModOptionsLoading } = useQuery(CHEM_MOD_OPTIONS_QUERY, () => ({ query: chemModQuery.value }));
    const { result: neutralLossOptionsResult, loading: neutralLossOptionsLoading } = useQuery(NEUTRAL_LOSS_OPTIONS_QUERY, () => ({ query: neutralLossQuery.value }));
    const chemModOptions : any = computed(() => {
      const chemMods = chemModOptionsResult.value.chemMods
      return [
        ...(chemModQuery.value ? [] : [{ chemMod: 'none', name: 'No chemical modification' }]),
        ...chemMods,
      ]
    });
    const neutralLossOptions : any = computed(() => {
      const neutralLosses = neutralLossOptionsResult.value.neutralLosses
      return [
        ...(neutralLossQuery.value ? [] : [{ neutralLoss: 'none', name: 'No neutral loss' }]),
        ...neutralLosses,
      ]
    });

    const filterLists = computed(() => {
      return store.state.filterLists || {
        adducts: [],
      }
    })


    // Computed properties and methods
    const formatValue = computed(() => {
      const { chemMod, neutralLoss, adduct } = props.filterValues
      let suffix = ''
      if (chemMod && chemMod !== 'none') {
        suffix += chemMod
      }
      if (neutralLoss && neutralLoss !== 'none') {
        suffix += neutralLoss
      }
      suffix = suffix.replace(/([+-])/g, ' $1 ')

      if (adduct) {
        const adductInfo = filterLists.value.adducts.find((a:any) => a.adduct === adduct)
        return (adductInfo && adductInfo.name || adduct).replace(']', suffix + ']')
      } else if ((chemMod && chemMod !== 'none') || (neutralLoss && neutralLoss !== 'none')) {
        return `[M + ?${suffix}]`
      } else if (chemMod === 'none' && neutralLoss === 'none') {
        return 'Only ionising adducts'
      } else if (chemMod === 'none') {
        return 'No chemical modification'
      } else if (neutralLoss === 'none') {
        return 'No neutral loss'
      } else {
        return '(Any)'
      }
    });

    const updateChemModQuery = (query: string) => {
      chemModQuery.value = query;
    };

    const updateNeutralLossQuery = (query: string) => {
      neutralLossQuery.value = query;
    };

    const onChange = (filterKey: 'chemMod' | 'neutralLoss' | 'adduct', val: any) => {
      if (val) {
        emit('change', val, filterKey)
      } else {
        emit('destroy', filterKey)
      }
    };

    const destroy = () => {
      emit('destroy', 'chemMod');
      emit('destroy', 'neutralLoss');
      emit('destroy', 'adduct');
    };

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
    };
  }
});
</script>

<style scoped>
.el-select {
  width: 100%;
}
</style>
