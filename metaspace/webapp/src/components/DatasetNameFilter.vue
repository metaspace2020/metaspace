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
      <el-option v-for="item in options"
                 :label="item.label"
                 :value="item.value"
                 :key="item.value">
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

 export default {
   name: 'dataset-name-filter',
   components: {
     TagFilter
   },
   props: ["name", "value"],

   data() {
     return {
       optionsQuery: gql`query DatasetFilterOptions($q: String) {
         options: allDatasets(filter: {name: $q}, limit: 10) {
           value: id
           label: name
         }
       }`,
       namesQuery: gql`query DatasetNames($ids: String) {
         options: allDatasets(filter: {ids: $ids}) {
           value: id
           currentLabel: name
         }
       }`,
       loading: false,
       options: [],
       currentLabel: '',
       value2: this.value || []
     }
   },

   watch: {
     value(newValue) {
       this.value2 = newValue;

       this.fetchNames(newValue);
     }
   },

   created() {
     this.fetchNames(this.value2);
     this.fetchOptions('');
   },

   methods: {
     fetchNames(ids) {
       this.$apollo.query({
         query: this.namesQuery,

         // TODO update when we make GraphQL accept an array
         variables: {ids: ids.join('|')}
       }).then(({data}) => {
         /* hack to make it show dataset names instead of ids */
         this.$refs.select.cachedOptions = data.options;
         this.$refs.select.setSelected();

         if (ids.length == 1) {
           this.currentLabel = data.options[0].currentLabel;
         }
       }).catch((err) => {/* TODO: more error reporting */});
     },
     fetchOptions(query) {
       this.loading = true;
       this.$apollo.query({
         query: this.optionsQuery,
         variables: {q: query}
       }).then(({data}) => {
         this.loading = false;
         this.options = data.options;
       }).catch((err) => {
         // TODO: more error reporting
         this.options = [];
       });
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
