<template>
  <el-collapse v-model="activeNames">
    <el-collapse-item title="Settings" name="settings">
      <el-row>
        <el-form inline label-width="100px">
          <el-col :span=8>
            <el-form-item label="FDR level">
              <el-select @change="onFdrLevelChange" v-model="fdrLevel">
                <el-option v-for="fdr in availableFdrLevels"
                           :value="fdr"
                           :label="fdr">
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-form>

        <el-col :span="16">
          <el-select placeholder="Filter annotations"
                     v-model="selectedFilterToAdd"
                     @change="addFilter">
            <el-option v-for="filterName in availableFilters"
                       :value="filterName" :label="filterName">
            </el-option>
          </el-select>
        </el-col>
    </el-row>

    <el-row>
      <component v-for="f in activeFilters"
                 :is="f.type"
                 :name="f.name"
                 :options="f.options"
                 :optionFormatter="f.optionFormatter"
                 :value="f.value"
                 :valueFormatter="f.valueFormatter"
                 @change="f.onChange"
                 @destroy="f.onDestroy">
      </component>
    </el-row>

  </el-collapse-item>
  </el-collapse>
</template>

<script>
 import gql from 'graphql-tag';
 import InputFilter from './InputFilter.vue';
 import SingleSelectFilter from './SingleSelectFilter.vue';
 import MultiSelectFilter from './MultiSelectFilter.vue';
 import { renderSumFormula } from '../util.js';

 const ADDUCT_POLARITY = {
   '+H': 'POSITIVE',
   '+Na': 'POSITIVE',
   '+K': 'POSITIVE',
   '-H': 'NEGATIVE',
   '+Cl': 'NEGATIVE',
 };

 const DATASET_NAME_FILTER = 'Select dataset';
 const COMPOUND_SEARCH_FILTER = 'Search compound';
 const ADDUCT_FILTER = 'Select adduct';
 const MSM_FILTER = 'Set minimum MSM score';

 export default {
   name: 'annotation-filter',
   components: {
     InputFilter,
     SingleSelectFilter,
     MultiSelectFilter
   },
   apollo: {
     datasetInfo: {
       query: gql`{allDatasets(limit: 1000) {
           name
           institution
       }}`,
       update: data => data.allDatasets
     }
   },
   computed: {
     institutionNames() {
       if (!this.datasetInfo)
         return [];
       return [...new Set(this.datasetInfo.map(x => x.institution))];
     },

     datasetNames() {
       return this.datasetInfo ? this.datasetInfo.map(x => x.name) : [];
     },

     activeFilters() {
       return this.activeFilterNames.map(this.makeFilter);
     },

     availableFilters() {
       const allNames = Object.keys(this.allFilters());
       const usedNames = this.activeFilterNames;
       return allNames.filter(n => usedNames.indexOf(n) == -1);
     }
   },
   data () {
     return {
       availableFdrLevels: [0.05, 0.1, 0.2, 0.5],
       fdrLevel: 0.1,
       filter: {
         datasetName: '',
         minMSM: 0.1,
         compoundName: '',
         adduct: null,
       },
       activeNames: ['settings'],
       activeFilterNames: [],
       selectedFilterToAdd: null
     }
   },
   watch: {
     "filter.datasetName": function() { this.$emit('change', this.filter); },
     "filter.compoundName": function() { this.$emit('change', this.filter); },
     "filter.minMSM": function() { this.$emit('change', this.filter); },
     "filter.adduct": function() { this.$emit('change', this.filter); },
   },
   created() {
     this.activeFilterNames.push(MSM_FILTER);
   },
   methods: {
     onFdrLevelChange (fdr) {
       this.fdrLevel = fdr;
       this.$emit('fdrChange', this.fdrLevel);
     },

     formatAdduct (adduct) {
       if (adduct === null)
         return '';
       else {
         return renderSumFormula('M', adduct, ADDUCT_POLARITY[adduct])
       }
     },

     makeDatasetNameFilter() {
       let self = this;
       return {
         type: SingleSelectFilter,
         name: 'Dataset',
         options: this.datasetNames,
         value: this.filter.datasetName,
         onChange(val) { self.filter.datasetName = val; },
         onDestroy() {
           self.removeFilter(DATASET_NAME_FILTER);
           self.filter.datasetName = null;
         }
       };
     },

     makeMSMFilter() {
       let self = this;
       return {
         type: InputFilter,
         name: 'Min. MSM',
         value: this.filter.minMSM,
         onChange(val) { self.filter.minMSM = val; },
         onDestroy() {
           self.removeFilter(MSM_FILTER);
           self.filter.minMSM = 0.0;
         }
       };
     },

     makeCompoundSearchFilter() {
       let self = this;
       return {
         type: InputFilter,
         name: 'Compound',
         value: this.filter.compoundName,
         onChange(val) { self.filter.compoundName = val; },
         onDestroy() {
           self.removeFilter(COMPOUND_SEARCH_FILTER);
           self.filter.compoundName = '';
         }
       };
     },

     makeAdductFilter() {
       let self = this;
       return {
         type: SingleSelectFilter,
         name: 'Adduct',
         options: [null, '+H', '-H', '+Na', '+Cl', '+K'],
         optionFormatter: self.formatAdduct,
         value: this.filter.adduct,
         valueFormatter: self.formatAdduct,
         onChange(val) { self.filter.adduct = val },
         onDestroy() {
           self.removeFilter(ADDUCT_FILTER);
           self.filter.adduct = null;
         }
       }
     },

     allFilters() {
       return {
         [DATASET_NAME_FILTER]: this.makeDatasetNameFilter,
         [MSM_FILTER]: this.makeMSMFilter,
         [COMPOUND_SEARCH_FILTER]: this.makeCompoundSearchFilter,
         [ADDUCT_FILTER]: this.makeAdductFilter
       };
     },

     makeFilter(name) {
       return this.allFilters()[name]();
     },

     addFilter(name) {
       if (name) {
         this.activeFilterNames.push(name);
         this.selectedFilterToAdd = null;
       }
     },

     removeFilter(name) {
       if (name) {
         this.activeFilterNames = this.activeFilterNames.filter(n => n != name);
       }
     }
   }
 }
</script>

<style>
 .el-form-item__content {
   text-align: left;
 }
</style>
