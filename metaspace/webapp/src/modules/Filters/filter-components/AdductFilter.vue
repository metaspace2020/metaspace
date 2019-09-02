<template>
  <tag-filter name="Adduct" removable @destroy="destroy">
    <div slot="edit">
      <el-select
        :value="filterValues.chemMod"
        @change="val => onChange('chemMod', val)"
        placeholder="Select chemical modification"
        clearable
      >
        <el-option v-for="item in chemModOptions"
                   :label="item.name"
                   :value="item.chemMod"
                   :key="item.chemMod"
        />
      </el-select>
      <el-select
        :value="filterValues.neutralLoss"
        @change="val => onChange('neutralLoss', val)"
        placeholder="Select neutral loss"
        clearable
      >
        <el-option v-for="item in neutralLossOptions"
                   :label="item.name"
                   :value="item.neutralLoss"
                   :key="item.neutralLoss"
        />
      </el-select>
      <el-select
        :value="filterValues.adduct"
        @change="val => onChange('adduct', val)"
        placeholder="Select ionising adduct"
        clearable
      >
        <el-option v-for="item in adductOptions"
                   :label="item.name"
                   :value="item.adduct"
                   :key="item.adduct"
        />
      </el-select>
    </div>

    <span slot="show" class="tf-value-span">
      <span>{{formatValue()}}</span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
  import TagFilter from './TagFilter.vue';
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator'
  import config from '../../../config';
  import {AdductSuggestion} from '../../../api/metadata';

  @Component({
    components: {
      TagFilter
    }
  })
  export default class AdductFilter extends Vue {
    @Prop(Object)
    filterValues: any;

    get filterLists() {
      return this.$store.state.filterLists || {
        chemMods: [],
        neutralLosses: [],
        adducts: [],
      }
    }

    get chemModOptions() {
      return [
        { chemMod: 'none', name: 'No chemical modification' },
        ...this.filterLists.chemMods
      ];
    }

    get neutralLossOptions() {
      return [
        {neutralLoss: 'none', name: 'No neutral loss'},
        ...this.filterLists.neutralLosses
      ];
    }

    get adductOptions() {
      return this.filterLists.adducts
        .filter((a: AdductSuggestion) => config.features.all_adducts || !a.hidden);
    }

    formatValue() {
      let {chemMod, neutralLoss, adduct} = this.filterValues;
      let innerPart = 'M';
      if(chemMod && chemMod !== 'none') {
        innerPart += chemMod;
      }
      if(neutralLoss && neutralLoss !== 'none') {
        innerPart += neutralLoss;
      }
      innerPart = innerPart.replace(/([+-])/g,' $1 ');

      if (adduct) {
        const adductInfo = this.filterLists.adducts.find((a:any) => a.adduct === adduct);
        return (adductInfo && adductInfo.name || adduct).replace('M', innerPart);
      } else if ((chemMod && chemMod !== 'none') || (neutralLoss && neutralLoss !== 'none')) {
        return `[${innerPart} + ?]`;
      } else if (chemMod === 'none' && neutralLoss === 'none') {
        return 'Only ionising adducts';
      } else if (chemMod === 'none') {
        return 'No chemical modification';
      } else if (neutralLoss === 'none') {
        return 'No neutral loss';
      } else {
        return '(Any)'
      }
    }

    onChange(filterKey: 'chemMod' | 'neutralLoss' | 'adduct', val: any) {
      if (val) {
        this.$emit('change', val, filterKey);
      } else {
        this.$emit('destroy', filterKey);
      }
    }

    destroy(): void {
      this.$emit('destroy', 'chemMod');
      this.$emit('destroy', 'neutralLoss');
      this.$emit('destroy', 'adduct');
    }
  };
</script>
<style scoped>
  .el-select {
    width: 100%;
  }
</style>
