<template>
  <tag-filter :name="name" :removable="removable"
              @destroy="destroy">
    <el-select slot="edit"
               :filterable="filterable" :clearable="clearable" v-model="value2">
      <el-option v-for="(item, idx) in options"
                 v-html="formatOption(item)" :value="item" :key="idx">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value" v-html="formatValue(value)"></span>
      <span v-else>
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
 import TagFilter from './TagFilter.vue';
 import Vue, { ComponentOptions } from 'vue';

 type Option = string | number;

 export default Vue.extend({
   name: 'single-select-filter',
   components: {
     TagFilter
   },
   props: {
     name: String,
     options: Array,
     value: [String, Number, Object],
     optionFormatter: Function,
     valueFormatter: Function,
     clearable: {type: Boolean, default: false},
     removable: {type: Boolean, default: true},
     filterable: {type: Boolean, default: true}
   },
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
     formatOption(option: Option): string {
       if (this.optionFormatter)
         return this.optionFormatter(option);
       else
         return option + '';
     },

     formatValue(value: Option): string {
       if (this.valueFormatter)
         return this.valueFormatter(value);
       else
         return value + '';
     },

     destroy(): void {
       this.$emit('destroy');
     }
   }
 })
</script>
