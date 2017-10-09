<template>
  <tag-filter :name="name" :removable="removable"
              @destroy="destroy">
    <el-select slot="edit"
               :filterable="filterable" :clearable="clearable" v-model="value2">
      <el-option v-for="item in options"
                 :label="formatOption(item)" :value="item" :key="item">
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

<script lang="ts">
 import TagFilter from './TagFilter.vue';
 import Vue, { ComponentOptions } from 'vue';

 type Option = string | number;

 interface SingleSelectFilter extends Vue {
   name: string
   options: Option[]
   value: Option
   value2: Option

   optionFormatter: (_: Option) => string
   valueFormatter: (_: Option) => string

   clearable: boolean
   removable: boolean
   filterable: boolean

   formatOption(option: Option): string
   formatValue(value: Option): string
   destroy(): void
 }

 export default {
   name: 'single-select-filter',
   components: {
     TagFilter
   },
   props: {
     name: String,
     options: Array,
     value: [String, Number],
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
         return value + '';
     },

     destroy() {
       this.$emit('destroy');
     }
   }
 } as ComponentOptions<SingleSelectFilter>;
</script>
