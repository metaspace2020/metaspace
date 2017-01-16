<template>
  <el-row style="padding-left: 10px;">
    <el-form inline label-width="100px" id="filter-form">
      <el-form-item label="FDR level">
        <el-select @change="onFdrLevelChange" v-model="selectedFdrLevel"
                   style="max-width: 100px;">
          <el-option v-for="fdr in availableFdrLevels"
                     :value="fdr" :label="fdr">
          </el-option>
        </el-select>
      </el-form-item>
    </el-form>

    <component v-for="f in activeFilters"
               :is="f.type"
               :name="f.name"
               :options="f.options"
               :optionFormatter="f.optionFormatter"
               :value="f.value"
               :valueFormatter="f.valueFormatter"
               style="float: left;"
               @change="f.onChange"
               @destroy="f.onChange(undefined)">
    </component>

    <el-select placeholder="Add filter"
               v-model="selectedFilterToAdd"
               @change="addFilter"
               style="float: left; width: 200px; margin-bottom: 10px;">
      <el-option v-for="f in availableFilters"
                 :value="f.key" :label="f.description">
      </el-option>
    </el-select>

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
   props: ["filter", "fdrLevel"],
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
   created() {
     let active = [];
     for (var key in this.filter) {
       if (this.filter[key] !== undefined)
         active.push(key);
     }
     this.activeKeys = active;
   },
   data () {
     return {
       availableFdrLevels: [0.05, 0.1, 0.2, 0.5],
       selectedFdrLevel: this.fdrLevel,
       selectedFilterToAdd: null,
       activeKeys: []
     }
   },
   methods: {
     onFdrLevelChange (fdr) {
       this.$emit('fdrChange', fdr);
     },

     makeFilter(filterKey) {
       const filterSpec = FILTER_SPECIFICATIONS[filterKey];
       let self = this;
       const behaviour = {
         value: self.filter[filterKey],
         // passing the value of undefined destroys the tag element
         onChange(val) {
           self.$emit('change',
                      Object.assign(self.filter, {[filterKey]: val}));
           if (val === undefined)
             self.activeKeys = self.activeKeys.filter(k => k != filterKey);
         }
       };
       let result = Object.assign({}, filterSpec, behaviour);
       if (typeof result.options === 'string')
         result.options = self[result.options];
       return result;
     },

     addFilter(key) {
       if (key) {
         const { initialValue } = FILTER_SPECIFICATIONS[key];
         this.$emit('change',
                    Object.assign(this.filter, {[key]: initialValue}));
         this.selectedFilterToAdd = null;
         this.activeKeys.push(key);
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
