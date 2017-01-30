<template>
  <el-row style="padding-left: 10px;">

    <el-select placeholder="Add filter"
               v-model="selectedFilterToAdd"
               @change="addFilter"
               style="float: left; width: 200px; margin-bottom: 10px;">
      <el-option v-for="f in availableFilters"
                 :value="f.key" :label="f.description">
      </el-option>
    </el-select>

    <component v-for="f in activeFilters"
               :is="f.type"
               :name="f.name"
               :options="f.options"
               :removable="f.removable"
               :filterable="f.filterable"
               :optionFormatter="f.optionFormatter"
               :value="f.value"
               :valueFormatter="f.valueFormatter"
               style="float: left;"
               @change="f.onChange"
               @destroy="f.onChange(undefined)">
    </component>
  </el-row>
</template>

<script>
 import gql from 'graphql-tag';
 import InputFilter from './InputFilter.vue';
 import SingleSelectFilter from './SingleSelectFilter.vue';
 import MultiSelectFilter from './MultiSelectFilter.vue';
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';

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
     filter() {
       return this.$store.state.filter;
     },

     activeKeys() {
       return this.$store.state.orderedActiveFilters;
     },

     institutionNames() {
       if (!this.datasetInfo)
         return [];
       let names = [...new Set(this.datasetInfo.map(x => x.institution))];
       names.sort();
       return names;
     },

     datasetNames() {
       return this.datasetInfo ? this.datasetInfo.map(x => x.name) : [];
     },

     activeFilters() {
       return this.activeKeys.map(this.makeFilter);
     },

     availableFilters() {
       let available = [];
       for (var key in FILTER_SPECIFICATIONS) {
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
       if (typeof result.options === 'string')
         result.options = self[result.options];
       return result;
     },

     addFilter(key) {
       if (key) {
         this.selectedFilterToAdd = null;
         this.$store.commit('addFilter', key);
       }
     }
   }
 }
</script>

<style>
 .el-form-item__content {
   text-align: left;
 }

 #filter-form {
   float: left;
 }

 #filter-form > .el-form-item {
   margin-bottom: 5px;
 }
</style>
