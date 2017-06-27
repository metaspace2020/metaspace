<template>
  <div class="filter-panel">
    <el-select placeholder="Add filter"
               v-model="selectedFilterToAdd"
               @change="addFilter"
               style="width: 200px; margin-bottom: 10px;">
      <el-option v-for="f in availableFilters"
                 :value="f.key" :label="f.description">
      </el-option>
    </el-select>

    <component v-for="f in activeFilters"
               :is="f.type"
               :name="f.name"
               :options="getFilterOptions(f)"
               :labels="f.labels"
               :clearable="f.clearable"
               :removable="f.removable"
               :filterable="f.filterable"
               :optionFormatter="f.optionFormatter"
               :value="f.value"
               :valueFormatter="f.valueFormatter"
               :width="f.width"
               @change="f.onChange"
               @destroy="f.onChange(undefined)">
    </component>
  </div>
</template>

<script>
 import InputFilter from './InputFilter.vue';
 import SingleSelectFilter from './SingleSelectFilter.vue';
 import MultiSelectFilter from './MultiSelectFilter.vue';
 import DatasetNameFilter from './DatasetNameFilter.vue';
 import MzFilter from './MzFilter.vue';
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';
 import {fetchOptionListsQuery} from '../api/metadata.js';

 const filterKeys = [
   'database',
   'fdrLevel',
   'institution',
   'submitter',
   'datasetIds',
   'compoundName',
   'mz',
   'polarity',
   'adduct',
   'organism',
   'organismPart',
   'condition',
   'analyzerType',
   'ionisationSource',
   'maldiMatrix',
   'minMSM'
 ];

 export default {
   name: 'filter-panel',
   props: ["level"],
   components: {
     InputFilter,
     SingleSelectFilter,
     MultiSelectFilter,
     DatasetNameFilter,
     MzFilter
   },
   apollo: {
     optionLists: {
       query: fetchOptionListsQuery,
       update: data => data
     }
   },
   computed: {
     filter() {
       return this.$store.getters.filter;
     },

     activeKeys() {
       return this.$store.state.orderedActiveFilters;
     },

     activeFilters() {
       return this.activeKeys.map(this.makeFilter);
     },

     availableFilters() {
       let available = [];
       for (let key of filterKeys) {
         if (FILTER_SPECIFICATIONS[key].levels.indexOf(this.level) == -1)
           continue;
         if (this.activeKeys.indexOf(key) == -1)
           available.push({key,
                           description: FILTER_SPECIFICATIONS[key].description})
       }
       return available;
     }
   },

   data () {
     return {
       selectedFilterToAdd: null,
     }
   },

   methods: {
     makeFilter(filterKey) {
       const filterSpec = FILTER_SPECIFICATIONS[filterKey];
       let self = this;
       const behaviour = {
         value: self.filter[filterKey],
         // passing the value of undefined destroys the tag element
         onChange(val) {
           self.$store.commit('updateFilter',
                              Object.assign(self.filter, {[filterKey]: val}));
         }
       };
       let result = Object.assign({}, filterSpec, behaviour);
       return result;
     },

     addFilter(key) {
       if (key) {
         this.selectedFilterToAdd = null;
         this.$store.commit('addFilter', key);
       }
     },

     getFilterOptions(filter) {
       // dynamically generated options are supported:
       // either specify a function of optionLists or one of its field names
       if (typeof filter.options === 'object')
         return filter.options;
       if (!this.optionLists)
         return [];
       if (typeof filter.options === 'string')
         return this.optionLists[filter.options];
       else if (typeof filter.options === 'function') {
         return filter.options(this.optionLists);
       }
       return [];
     }
   }
 }
</script>

<style>
 .filter-panel {
   display: inline-flex;
   align-items: flex-start;
   flex-wrap: wrap;
   padding: 0px 4px;
 }

 .el-select-dropdown__wrap {
   /* so that no scrolling is necessary */
   max-height: 480px;
 }

 .el-select-dropdown__wrap {
    max-height: 500px;
 }
</style>
