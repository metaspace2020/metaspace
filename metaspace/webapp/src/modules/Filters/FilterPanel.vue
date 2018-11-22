<template>
  <div class="filter-panel">
    <el-select v-if="anyOptionalFilterPresent"
               class="filter-select"
               placeholder="Add filter"
               v-model="selectedFilterToAdd"
               @change="addFilter">
      <el-option v-for="f in availableFilters" :key="f.key"
                 :value="f.key" :label="f.description">
      </el-option>
    </el-select>

    <component v-for="f in visibleFilters" :key="f.filterKey"
               :data-test-key="f.filterKey"
               :is="f.type"
               :filterKey="f.filterKey"
               :name="f.name"
               :options="f.options"
               :labels="f.labels"
               :clearable="f.clearable"
               :removable="f.removable"
               :filterable="f.filterable"
               :multiple="f.multiple"
               :optionFormatter="f.optionFormatter"
               :value="f.value"
               :valueFormatter="f.valueFormatter"
               :valueKey="f.valueKey"
               :width="f.width"
               @change="f.onChange"
               @destroy="f.onChange(undefined)">
    </component>
  </div>
</template>

<script>
 import {FILTER_SPECIFICATIONS} from './filterSpecs';

 const orderedFilterKeys = [
   'database',
   'fdrLevel',
   'group',
   'project',
   'submitter',
   'datasetIds',
   'compoundName',
   'mz',
   'polarity',
   'adduct',
   'organism',
   'organismPart',
   'condition',
   'growthConditions',
   'analyzerType',
   'ionisationSource',
   'maldiMatrix',
   'minMSM',
   'simpleQuery',
   'simpleFilter',
   'metadataType'
 ];

 const filterComponents = {};
 Object.keys(FILTER_SPECIFICATIONS).reduce((accum, cur) => {
   const componentType = FILTER_SPECIFICATIONS[cur].type;
   // a bit hacky way of getting component name b/c of different ways of initialization
   if (!componentType.name && !(componentType.options && componentType.options.name)) {
     throw new Error('Missing name in FILTER_SPECIFICATIONS component type');
   }
   const typeName = ('options' in componentType) ? componentType['options'].name : componentType.name;
   if (!(typeName in accum)) {
     accum[typeName] = componentType;
   }
   return accum;
 }, filterComponents);

 export default {
   name: 'filter-panel',
   props: ["level", "simpleFilterOptions"],
   components: filterComponents,
   mounted() {
     this.$store.dispatch('initFilterLists');
   },
   computed: {
     filter() {
       return this.$store.getters.filter;
     },

     activeKeys() {
       return this.$store.state.orderedActiveFilters;
     },

     visibleFilters() {
       return this.activeKeys
                  .filter(this.shouldShowFilter)
                  .map(this.makeFilter);
     },

     availableFilters() {
       let available = [];
       for (let key of orderedFilterKeys) {
         if (FILTER_SPECIFICATIONS[key].levels.indexOf(this.level) == -1)
           continue;
         if (this.activeKeys.indexOf(key) == -1)
           available.push({key,
                           description: FILTER_SPECIFICATIONS[key].description})
       }
       return available;
     },

     anyOptionalFilterPresent() {
       for (const filter of this.availableFilters) {
         if (!('removable' in FILTER_SPECIFICATIONS[filter.key]) || FILTER_SPECIFICATIONS[filter.key]['removable']) {
           return true;
         }
       }
       return false;
     }
   },

   watch: {
     simpleFilterOptions(newVal) {
       // Remove simpleFilter if it has a value that's no longer selectable
       if (this.filter.simpleFilter != null &&
         (newVal == null || !newVal.some(opt => opt.value === this.filter.simpleFilter))) {
         self.$store.commit('updateFilter', {...this.filter, simpleFilter: null});
       }
     }
   },

   data () {
     return {
       selectedFilterToAdd: null
     }
   },

   methods: {
     shouldShowFilter(filterKey) {
       const {hidden} = FILTER_SPECIFICATIONS[filterKey];
       if (typeof hidden === 'function' ? hidden() : (hidden != null && hidden)) {
         return false;
       }
       if (filterKey === 'simpleFilter') {
         return this.simpleFilterOptions != null;
       }
       return true;
     },

     makeFilter(filterKey) {
       const filterSpec = FILTER_SPECIFICATIONS[filterKey];
       let self = this;
       const behaviour = {
         filterKey,
         value: self.filter[filterKey],
         options: this.getFilterOptions(filterSpec, filterKey),
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

     getFilterOptions(filter, filterKey) {
       const {filterLists} = this.$store.state;
       // dynamically generated options are supported:
       // either specify a function of optionLists or one of its field names
       if (filterKey === 'simpleFilter')
         return this.simpleFilterOptions;
       if (typeof filter.options === 'object')
         return filter.options;
       if (filterLists == null)
         return [];
       if (typeof filter.options === 'string')
         return filterLists[filter.options];
       else if (typeof filter.options === 'function') {
         return filter.options(filterLists);
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
   margin: -5px -5px 5px; /* Remove margins of .tf-outer so that they're properly aligned. Add margin to bottom to fit well with other components */
 }

 .filter-select {
   width: 200px;
   margin: 5px;
 }

 .el-select-dropdown__wrap {
   /* so that no scrolling is necessary */
   max-height: 480px;
 }

 .el-select-dropdown__wrap {
    max-height: 500px;
 }
</style>
