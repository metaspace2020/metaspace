<template>
  <tag-filter :name="name" @destroy="destroy" :width=900>
    <el-select slot="edit"
               ref="select"
               placeholder="Start typing dataset name"
               remote multiple filterable clearable
               :remote-method="fetchOptions"
               :loading="loading"
               loading-text="Loading matching entries..."
               no-match-text="No matches"
               :multiple-limit=10
               v-model="value2" @change="onChange">
      <el-option v-for="(item, idx) in options"
                 :label="item.label"
                 :value="item.value"
                 :key="idx">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value2.length == 1">
        {{ currentLabel }}
      </span>
      <span v-if="value2.length > 1" >
        ({{ value2.length }} items selected)
      </span>
      <span v-if="value2.length == 0">
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script>
 import TagFilter from './TagFilter.vue';
 import gql from 'graphql-tag';
 import deepcopy from 'deepcopy';

 const optionsQuery =
  gql`query DatasetFilterOptions($df: DatasetFilter, $orderBy: DatasetOrderBy,
                                 $sortDir: SortingOrder) {
  options: allDatasets(filter: $df,
    orderBy: $orderBy, sortingOrder: $sortDir, limit: 20) {
      value: id
      label: name
    }
  }`;

 const namesQuery = gql`query DatasetNames($ids: String) {
   options: allDatasets(filter: {ids: $ids}) {
     value: id
     currentLabel: name
   }
 }`;

 export default {
   name: 'dataset-name-filter',
   components: {
     TagFilter
   },
   props: ["name", "value"],

   data() {
     return {
       loading: false,
       options: [],
       cachedOptions: [],
       currentLabel: '',
       value2: this.value || []
     }
   },

   watch: {
     value(newValue) {
       this.value2 = newValue || [];

       this.fetchNames(this.value2);
     }
   },

   created() {
     this.fetchNames(this.value2);
     this.fetchOptions('');
   },

   methods: {
     joinOptions() {
       // adds/moves selected values to the top of the options list

       let valueToLabel = {};
       for (let {value, currentLabel} of this.cachedOptions)
         valueToLabel[value] = currentLabel;

       let options = this.value2.map(value => ({value, label: valueToLabel[value]}));
       let values = [...this.value2];

       // add currently selected values to the list
       for (let i = 0; i < this.options.length; i++) {
         const item = this.options[i];
         if (values.indexOf(item.value) == -1) {
           values.push(item.value);
           options.push(item);
         }
       }

       this.options = options;
     },

     async fetchNames(ids) {
       const {data} = await this.$apollo.query({
         query: namesQuery,

         // TODO update when we make GraphQL accept an array
         variables: {ids: ids.join('|')}
       });
       this.cachedOptions = deepcopy(data.options);
       /* hack to make it show dataset names instead of ids */
       this.$refs.select.cachedOptions = this.cachedOptions;
       this.$refs.select.setSelected();

       this.joinOptions();
       if (ids.length === 1) {
         // data.options.length may be 0 if an invalid ID is passed due to URL truncation or a dataset becoming hidden
         this.currentLabel = data.options.length >= 0 ? data.options[0].currentLabel : ids[0];
       }
     },

     async fetchOptions(query) {
       this.loading = true;

       let orderBy = 'ORDER_BY_NAME', sortDir = 'ASCENDING';
       if (query.length == 0) {
         // show most recent datasets for an empty query
         orderBy = 'ORDER_BY_DATE';
         sortDir = 'DESCENDING';
       }

       // take current dataset filter from the store and adjust it
       const df = Object.assign({name: query, status: 'FINISHED'},
                                this.$store.getters.gqlDatasetFilter);
       delete df.ids;
       try {
         const {data} = await this.$apollo.query({
           query: optionsQuery,
           variables: {df, orderBy, sortDir}
         });
         this.loading = false;
         this.options = deepcopy(data.options).sort();
         this.joinOptions();
       } catch (err) {
         this.options = [];
         throw err;
       }
     },
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy(val) {
       this.$emit('destroy');
     }
   }
 }
</script>

<style>
 .el-select-dropdown.is-multiple .el-select-dropdown__wrap {
   max-height: 600px;
 }
</style>
