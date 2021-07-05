<template>
  <tag-filter
    name="Adduct"
    removable
    @destroy="destroy"
  >
    <div slot="edit">
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
    </div>

    <span
      slot="show"
      class="tf-value-span"
    >
      <span>{{ formatValue() }}</span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
import TagFilter from './TagFilter.vue'
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import config from '../../../lib/config'
import {
  AdductSuggestion,
  ChemModSuggestion,
  chemModSuggestionQuery,
  NeutralLossSuggestion, neutralLossSuggestionQuery,
} from '../../../api/metadata'

  @Component<AdductFilter>({
    components: {
      TagFilter,
    },
    apollo: {
      chemModOptions: {
        query: chemModSuggestionQuery,
        fetchPolicy: 'cache-first',
        loadingKey: 'chemModOptionsLoading',
        variables() {
          return { query: this.chemModQuery }
        },
        update({ chemMods }: {chemMods: ChemModSuggestion[]}) {
          return [
            ...(this.chemModQuery ? [] : [{ chemMod: 'none', name: 'No chemical modification' }]),
            ...chemMods,
          ]
        },
      },
      neutralLossOptions: {
        query: neutralLossSuggestionQuery,
        fetchPolicy: 'cache-first',
        loadingKey: 'neutralLossOptionsLoading',
        variables() {
          return { query: this.neutralLossQuery }
        },
        update({ neutralLosses }: {neutralLosses: NeutralLossSuggestion[]}) {
          return [
            ...(this.neutralLossQuery ? [] : [{ neutralLoss: 'none', name: 'No neutral loss' }]),
            ...neutralLosses,
          ]
        },
      },
    },
  })
export default class AdductFilter extends Vue {
    @Prop(Object)
    filterValues: any;

    chemModQuery: string = '';
    neutralLossQuery: string = '';
    chemModOptions!: ChemModSuggestion[];
    neutralLossOptions!: NeutralLossSuggestion[];
    chemModOptionsLoading = 0;
    neutralLossOptionsLoading = 0;

    get filterLists() {
      return this.$store.state.filterLists || {
        adducts: [],
      }
    }

    get adductOptions() {
      return this.filterLists.adducts
        .filter((a: AdductSuggestion) => config.features.all_adducts || !a.hidden)
    }

    get showChemMods() {
      return config.features.chem_mods || this.filterValues.chemMod != null
    }

    get showNeutralLosses() {
      return config.features.neutral_losses || this.filterValues.neutralLoss != null
    }

    formatValue() {
      const { chemMod, neutralLoss, adduct } = this.filterValues
      let suffix = ''
      if (chemMod && chemMod !== 'none') {
        suffix += chemMod
      }
      if (neutralLoss && neutralLoss !== 'none') {
        suffix += neutralLoss
      }
      suffix = suffix.replace(/([+-])/g, ' $1 ')

      if (adduct) {
        const adductInfo = this.filterLists.adducts.find((a:any) => a.adduct === adduct)
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
    }

    updateChemModQuery(query: string) {
      this.chemModQuery = query
    }

    updateNeutralLossQuery(query: string) {
      this.neutralLossQuery = query
    }

    onChange(filterKey: 'chemMod' | 'neutralLoss' | 'adduct', val: any) {
      if (val) {
        this.$emit('change', val, filterKey)
      } else {
        this.$emit('destroy', filterKey)
      }
    }

    destroy(): void {
      this.$emit('destroy', 'chemMod')
      this.$emit('destroy', 'neutralLoss')
      this.$emit('destroy', 'adduct')
    }
}
</script>
<style scoped>
  .el-select {
    width: 100%;
  }
</style>
