<template>
  <tag-filter :name="name" :removable="removable"
              @destroy="destroy">
    <el-select slot="edit"
               :filterable="filterable" clearable v-model="value2">
      <el-option v-for="item in options"
                 :label="formatOption(item)" :value="item">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value" >
        {{ formatValue(value) }}
      </span>
      <span v-else>
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script>
 import TagFilter from './TagFilter.vue';
 export default {
   name: 'single-select-filter',
   components: {
     TagFilter
   },
   props: ["name", "options", "value", "optionFormatter", "valueFormatter",
           "removable", "filterable"],
   data() {
     return {
       value2: this.value
     };
   },
   watch: {
     // TODO: why :value="value" + @change="onChange" doesn't work?
     value2(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     }
   },
   methods: {
     formatOption(option) {
       if (this.optionFormatter)
         return this.optionFormatter(option);
       else
         return option;
     },

     formatValue(value) {
       if (this.valueFormatter)
         return this.valueFormatter(value);
       else
         return value;
     },

     destroy() {
       this.$emit('destroy');
     }
   }
 }
</script>
